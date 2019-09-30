var set = require('lodash.set');

const EVENT_SOURCE = {
    HTTP         : 'http',
    STEP_FUNCTION: 'stepFunctions',
    BASIC        : 'basic'
}

let log;
let sns;

module.exports = function(fn, config) {
    log = getParam(config, 'logger', console);
    topicArn = getParam(config, 'topicArn', undefined);

    return async (event, context) => {
        const eventSource = getEventSource(event, context);
        const data = mapEvent(eventSource, event, context);
        const {resp, error} = await safeFnExecution(fn, data);
        await sendNofication(topicArn, resp, error);
        return mapResponse(eventSource, event, resp, error);
    }
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
                                                           mapHttpEvent(event, context);
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

function mapHttpEvent(event, context){
    return {
        ...parseMultiValueQueryStringParameters(event.multiValueQueryStringParameters),
        ...event.pathParameters,
        ...parseBody(event.body),
        ...context
    };
}

async function safeFnExecution(fn, data){
    try {
        return {resp: await fn(data)};
    }
    catch(e){
        return {error: e};
    }
}

function parseMultiValueQueryStringParameters(params) {
    if(!params) return {};
    for(var key in params) {
        params[key] = (params[key].length) > 1 ? params[key] : params[key][0];
    }
    return params;
}

function parseBody(body) {
    if(!body) return undefined;
    try{
        return JSON.parse(body);
    }
    catch(e){
        log.error(e);
        return {};
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
    return (mode === EVENT_SOURCE.HTTP)          ? mapHttpResponse(response, error) :
           (mode === EVENT_SOURCE.STEP_FUNCTION) ? mapStepFunctionResponse(event, response, error) :
                                                   mapBasicResponse(response, error);
}

function mapHttpResponse(resp, error) {
    if(error){
        log.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({message: error.message})
        }
    }
    return {
        statusCode: (resp.code || 500),
        body: JSON.stringify(resp.body)
    };
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
