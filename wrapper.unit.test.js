const {expect} = require('chai');
const wrapper = require('./wrapper');

function requireUncached(module){
    delete require.cache[require.resolve(module)]
    return require(module)
}

let lastLog;

const fnMock = async (event) => ({code: 200, body: event});

const callbackMockFunction = (event, callback) => {
  // callback is executed on top function
  callback(null, {
    statusCode: 200,
    headers: {'Content-Type': 'image/gif'},
    body: 'pixelString',
    isBase64Encoded: true
  })
  // no return function
};

const logMock = {
    error: (data) => lastLog = data,
    debug: (data) => lastLog = data
};

describe('wrapper', () => {
    let fn;

    it('must return a function', async () => {
        fn = wrapper(fnMock, {log: logMock});
        expect(fn).to.be.a('function');
    });

    it('on warm up events must return the sample warmup text', async () => {
        const event = {source: 'serverless-plugin-warmup'};
        const resp = await fn(event);
        expect(resp).to.be.equal('Lambda is warm');
    });

    it('must send a notification on succed', async () => {
        const event = requireUncached('./events/post.json');
        const config = {
            topicArn: 'arn:aws:sns:eu-west-1:015414317816:aws-lambda-event-wrapper-test',
            logger: logMock
        }
        const wrappedFn = wrapper(fnMock, config);
        const resp = await wrappedFn(event);
        expect(resp).to.be.deep.equal({
            statusCode:200,
            body: '{"to":"s.falcon@boatjump.com","from":"s.falcon@boatjump.com","subject":"test","message":"test, test, test"}'
        });
        expect(lastLog).to.be.an('object');
        expect(lastLog).to.contain.keys(['ResponseMetadata', 'MessageId'])
    });

    describe('when called using callback', ()=> {
        fn = wrapper(fnMock, {log: logMock});
        const event = {event: "hello"};

        it('must allow usage with context', (done) => {
            const context = {context: "world"}
            fn(event, context, (err, data) => {
                expect(err).to.be.equal(null);
                expect(data).to.be.deep.equal({...event, ...context});
                done();
            });
        });
    
        it('must allow usage without context', (done) => {
            fn(event, (err, data) => {
                expect(err).to.be.equal(null);
                expect(data).to.be.deep.equal(event);
                done();
            });
        });

        it('must execute callback on top function. Have to be executed only one time and the function does not return response', (done) => {
          fn = wrapper(callbackMockFunction, {log: logMock});
          fn(event, (err, data) => {
            console.log(data);
            expect(err).to.be.equal(null);
            expect(data).to.be.deep.equal(event);
            done();
          });
        });
    });

    describe('on step functions events', () => {

        it('must parse correctly the @input parameters and set the response into @output', async () => {
            event = {
                "@input.a": 1,
                "@input.b": 2,
                "@state": {
                  "Name": "testFn",
                  "EnteredTime": "2019-09-29T15:13:54.296Z",
                  "RetryCount": 0
                },
                "@output": {
                  "HelloWorld1": {
                    "value": null
                  }
                }
              };
            const context = {functionName: 'fn'}
            const resp = await fn(event, context);
            expect(resp).to.contain.keys(['@output']);
            expect(resp['@output']).to.contain.keys(['testFn']);
            expect(resp['@output'].testFn).to.be.deep.equal({ a: 1, b: 2, functionName: 'fn' });
        });
    });

    describe('on basic event', () => {
        it('must return the response unchanged', async () => {
            const event = {hello: "world"};
            const resp = await fn(event);
            expect(resp).to.be.deep.equal(event);
        });
    });

    describe('on http events', () => {
        it('if it uses a GET method, must return the status code and body', async () => {
            const event = requireUncached('./events/get.json');
            const resp = await fn(event);
            expect(resp).to.be.deep.equal({
                statusCode:200,
                body: '{"token":"5678","id":"1234"}'
            });

        });
    
        it('if it uses a POST method, must return the status code and body', async () => {
            const event = requireUncached('./events/post.json');
            const resp = await fn(event);
            expect(resp).to.be.deep.equal({
                statusCode:200,
                body: '{"to":"s.falcon@boatjump.com","from":"s.falcon@boatjump.com","subject":"test","message":"test, test, test"}'
            });
        });

        it('must return the same result if the function response does not contain code and body', async () => {
            const fnMockDirect = async (event) => (event);
            const event = requireUncached('./events/get.json');
            const wrappedFnStandard = wrapper(fnMock);
            const wrappedFnDirect   = wrapper(fnMockDirect);
            const respStandard = await wrappedFnStandard(event);
            const respDirect   = await wrappedFnDirect(event);
            expect(respStandard).to.be.deep.equal(respDirect);
            expect(respStandard).to.have.keys('statusCode', 'body');
        });

        it('must work as a proxy if status code is provided', async () => {
            const bodyMock = {data: 'ok'};
            const fnMockProxy = async (event) => ({statusCode: 201, body: bodyMock});
            const event = requireUncached('./events/get.json');
            const wrappedFn = wrapper(fnMockProxy);
            const resp = await wrappedFn(event);
            expect(resp).to.have.keys('statusCode', 'body');
            expect(resp.statusCode).to.be.equal(201);
            expect(resp.body).to.be.equal(bodyMock);
            expect
        });
    });
});
