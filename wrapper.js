var set = require('lodash.set');
var httpEvent = require('./lib/httpEvent');

const EVENT_SOURCE = {
    HTTP         : 'http',
    STEP_FUNCTION: 'stepFunctions',
    BASIC        : 'basic'
}

module.exports = function wrapper(fn, config) {
    let sns;
    const log = getParam(config, 'logger', console);
    const topicArn = getParam(config, 'topicArn', undefined);

    return function (...args){
        const callback = arguments[arguments.length-1];
        const resp = promiseWrapper(...args);
        if(typeof callback !== 'function') return resp;
        resp.then((data) => callback(null, data))
            .catch((err) => callback(err));
    }

    async function promiseWrapper(event, context, callback) {
        if (typeof context === 'function') {
          callback = context;
          context = undefined;
        }
        if (event.source === 'serverless-plugin-warmup') {
            return 'Lambda is warm';
        }
        const eventSource = getEventSource(event, context);
        const data = mapEvent(eventSource, event, context);
        const {resp, error} = await safeFnExecution(fn, data, callback);
        await sendNofication(topicArn, resp, error);
        return mapResponse(eventSource, event, resp, error);
    }

    function getParam(config, key, defaultValue) {
        return (config && config[key]) ? config[key] : defaultValue;
    }

    function getEventSource(event, context){
        return (event   &&   event.httpMethod)   ? EVENT_SOURCE.HTTP :
               (context && context.functionName) ? EVENT_SOURCE.STEP_FUNCTION :
                                                   EVENT_SOURCE.BASIC;
    }

    function mapEvent(eventSource, event, context){
        return  (eventSource === EVENT_SOURCE.BASIC)         ? mapBasicEvent(event, context) :
                (eventSource === EVENT_SOURCE.STEP_FUNCTION) ? mapStepFunctionsEvent(event, context) :    
                                                               httpEvent.parse(event, context, log);
    }

    function mapBasicEvent(event, context){
        return {...event, ...context};
    }

    function mapStepFunctionsEvent(event, context){
        try {
            const eventInput = Object.keys(event)
            .filter((key) => key.indexOf('@input') === 0)
            .reduce((acc, item) => {
                const key = item.split('@input.')[1];
                set(acc, key, event[item]);
                return acc;
            }, {});
            return {...eventInput, ...context};
        }
        catch(e) {
            return mapBasicEvent(event, context);
        }
        
    }

    async function safeFnExecution(fn, data, callback) {
        try {
          return {resp: await fn(data, callback)};
        }
        catch(e){
            return {error: e};
        }
    }

    async function sendNofication(TopicArn, resp, error) {
        try{
            if (error || !TopicArn) return;
            const Message = JSON.stringify(resp);
            const message = await getSNS().publish({Message, TopicArn}).promise()
            log.debug(message);
        }
        catch(e){
            e.message = `Fail while sending a notification to ${TopicArn}. `+e.message;
            log.error(e);
        }
    }

    function getSNS(){
        if (sns) return sns;
        const AWS = require('aws-sdk');
        AWS.config.update({region: 'eu-west-1'});
        sns = new AWS.SNS({apiVersion: '2010-03-31'});
        return sns;
    }

    function mapResponse(mode, event, response, error) {
        return (mode === EVENT_SOURCE.HTTP)          ? httpEvent.response(response, error, log) :
            (mode === EVENT_SOURCE.STEP_FUNCTION) ? mapStepFunctionResponse(event, response, error) :
                                                    mapBasicResponse(response, error);
    }

    function mapStepFunctionResponse(event, resp, error) {
        if(error) throw error;
        const stateName = event['@state'].Name;
        event['@output'] = event['@output'] || {};
        event['@output'][stateName] = resp.body
        return event;
    }

    function mapBasicResponse(resp, error) {
        if(error) throw error;
        return resp.body;
    }
}
