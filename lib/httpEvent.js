module.exports = {
  parse,
  response
}

function parse(event, context){
  return {
      ...parseMultiValueQueryStringParameters(event.multiValueQueryStringParameters),
      ...event.pathParameters,
      ...parseBody(event.body),
      ...context
  };
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

function response(resp, error) {
  return (error)           ? httpError(error) :
         (resp.statusCode) ? httpProxy(resp) :
         (!resp.code)      ? httpPlainResponse(resp) :
                             httpDefault(resp);
}

function httpError(error) {
  log.error(error);
  return {
      statusCode: 500,
      body: JSON.stringify({message: error.message})
  };
}

function httpPlainResponse(resp) {
  return {
      statusCode: 200,
      body: JSON.stringify(resp)
  };
}

function httpProxy(resp) {
  return resp;
}

function httpDefault(resp) {
  return {
    statusCode: resp.code,
    body: JSON.stringify(resp.body)
  };
}
