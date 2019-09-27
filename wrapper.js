const EVENT_SOURCE = {
    HTTP         : 'http',
    STEP_FUNCTION: 'stepFunctions',
    BASIC        : 'basic'
}

let log;

module.exports = function(fn, logger) {
    log = logger || console;
    return async (event, context) => {
        const eventSource = getEventSource(event, context);
        const data = mapEvent(eventSource, event, context);
        const {resp, error} = await safeFnExecution(fn, data);
        return mapResponse(eventSource, resp, error);
    }
}

function getEventSource(event, context){
    return (event   &&   event.httpMethod)   ? EVENT_SOURCE.HTTP :
           (context && context.functionName) ? EVENT_SOURCE.STEP_FUNCTION :
                                   EVENT_SOURCE.BASIC;
}

function mapEvent(eventSource, event, context){
    return (eventSource === EVENT_SOURCE.BASIC) ? 
        { ...event, ...context} :    
        {
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
        log(e);
        return {};
    }
}

function mapResponse(mode, response, error) {
    return (mode === EVENT_SOURCE.HTTP)          ? mapHttpResponse(response, error) :
           (mode === EVENT_SOURCE.STEP_FUNCTION) ? mapStepFunctionResponse(response, error) :
                                                   mapBasicResponse(response, error);
}

function mapHttpResponse(resp, error) {
    if(error) log.error(error);
    return {
        statusCode: (resp.code || 500),
        body: JSON.stringify(resp.body || {message: error.message})
    };
}

function mapStepFunctionResponse(resp, error) {
    if(error) throw error;
    return resp.body;
}

function mapBasicResponse(resp, error) {
    if(error) throw error;
    return resp.body;
}