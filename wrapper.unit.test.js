const {expect} = require('chai');
const wrapper = require('./wrapper');

function requireUncached(module){
    delete require.cache[require.resolve(module)]
    return require(module)
}

let lastLog;

const fnMock = async (event, context) => ({code: 200, body: event});
const logMock = {error: (data) => lastLog = data };

describe('wrapper', () => {
    let fn;

    it('must return a function', async () => {
        fn = wrapper(fnMock, logMock);
        expect(fn).to.be.a('function');
    });

    describe('after execute the function', () => {
        it('must work with a basic event', async () => {
            const event = {hello: "world"};
            const resp = await fn(event);
            expect(resp).to.be.deep.equal(event);
        });
    
        it('must work with a http get event', async () => {
            const event = requireUncached('./events/get.json');
            const resp = await fn(event);
            expect(resp).to.be.deep.equal({
                statusCode:200,
                body: '{"token":"5678","id":"1234"}'
            });

        });
    
        it('must work with a http post event', async () => {
            const event = requireUncached('./events/post.json');
            const resp = await fn(event);
            expect(resp).to.be.deep.equal({
                statusCode:200,
                body: '{"to":"s.falcon@boatjump.com","from":"s.falcon@boatjump.com","subject":"test","message":"test, test, test"}'
            });
        });
    });


});