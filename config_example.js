var fs = require('fs');

module.exports = {
    config: {
        name: 'Botname',
        channel: 'my channel',

        default_volume: 2,
        mpd_stream: 'http://127.0.0.1:8000/stream.ogg',

        server: 'mumble://myserver.com:12345',
        password: 'a password',

        tls: {
            // you can generate a new pem like this:
            //  openssl req -x509 -newkey rsa:2048 -nodes -keyout client.pem -out client.pem
            //key: fs.readFileSync('key.pem'),
            //cert: fs.readFileSync('cert.pem')

            // or, you can use a p12 formatted key
            //pfx: fs.readFileSync('client.p12')
        }
    }
};

