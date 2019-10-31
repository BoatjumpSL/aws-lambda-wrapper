const chai = require('chai')
const expect = chai.expect;
chai.use(require('chai-as-promised'));
const wrapper = require('./wrapper');

function requireUncached(module){
    delete require.cache[require.resolve(module)]
    return require(module)
}

let lastLog;

const fnMock = async (event) => ({code: 200, body: event});

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
    }).timeout(5000);

    describe('when called using callback', ()=> {
        fn = wrapper(fnMock, {log: logMock});
        const event = {event: "hello"};

        it('must allow usage with context', async () => {
            const context = {context: "world"}
            const resp = await fn(event, context);
            expect(resp).to.be.deep.equal({...event, ...context});
        });

        it('must allow usage without context', async () => {
            const resp = await fn(event);
            expect(resp).to.be.deep.equal(event);
        });
    
        it('must return a controlled error when the callback contains an error', async () => {
            const error = new Error('controlled Error');
            const fnMockUsingCallback = (event, callback) => {
                callback(error);
            };
            const fn = wrapper(fnMockUsingCallback, {log: logMock});
            const respPromise = fn(event);
            await expect(respPromise).to.be.rejectedWith(Error);
        });

        it('must return a controlled error when the function thows an exception', async () => {
            const error = new Error('controlled Error');
            const fnMockUsingCallback = (event, callback) => {
                throw(error);
            };
            const fn = wrapper(fnMockUsingCallback, {log: logMock});
            const respPromise = fn(event);
            await expect(respPromise).to.be.rejectedWith(Error);
        });

        it('must execute callback on top function. Have to be executed only one time and the function does not return response', async () => {
            const event = requireUncached('./events/get.json');
            const fnResponse = {
                statusCode: 200,
                headers: {'Content-Type': 'image/gif'},
                body: 'pixelString',
                isBase64Encoded: true
              };
            const fnMockUsingCallback = (event, callback) => {
                callback(null, fnResponse);
            };
            const fn = wrapper(fnMockUsingCallback, {log: logMock});
            const resp = await fn(event);
            expect(resp).to.be.deep.equal(fnResponse);
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

        it('if it uses a GET method with query parameters, must return the status code and body', async () => {
            const expectedResponse = {'@id': '1'};
            const event = requireUncached('./events/getWithQueryParameters.json');
            const fn = wrapper(fnMock, {log: logMock});
            const resp = await fn(event);
            expect(resp).to.be.deep.equal({
                statusCode:200,
                body: JSON.stringify(expectedResponse)
            });
            async function fnMock(input){
                expect(input).to.be.deep.equal(expectedResponse)
                return {code: 200, body: input};
            }

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
        });
    });
});
