module.exports = {
  parse,
  response
}

function parse(event, context, log){
  return {
    ...parseMultiValueQueryStringParameters(event.multiValueQueryStringParameters),
    ...event.pathParameters,
    ...parseBody(event.body),
    ...context
  };

  function parseMultiValueQueryStringParameters(params) {
    if (!params) return {};
    for (var key in params) {
      if (params[key])
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
      e.message = 'Input message body was expected to be an stringified Object but parsing failed. '+e.message;
      log.error(e);
      return {};
    }
  }
}

function response(event, resp, error, log) {
  const origin = event.headers.Referer || '';
  const corsHeaders = getCORSHeaders(origin);
  const headers = corsHeaders ? {headers: corsHeaders} : {};

  return (error)           ? httpError(error) :
    (resp.statusCode) ? httpProxy(resp) :
    (!resp.code)      ? httpPlainResponse(resp) :
    httpDefault(resp);

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
      ...headers,
      body: JSON.stringify(resp)
    };
  }

  function httpProxy(resp) {
    return {...headers, ...resp};
  }

  function httpDefault(resp) {
    return {
      statusCode: resp.code,
      ...headers,
      body: JSON.stringify(resp.body)
    };
  }
}

function getCORSHeaders(requestOrigin) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(';') : [];
  const matchedOrigins = getMatchingOrigins(allowedOrigins, requestOrigin)

  return (!matchedOrigins.length) ? null : {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Credentials': true,
  }
}

function getMatchingOrigins(allowed, request) {
  return allowed.filter((origin) => {
    origin = origin.replace("*", "\\w+");
    const regex = new RegExp(origin, "u");
    return request.match(regex);
  })
}
