const config = {
    "port": 8080,
    "callback_uri": "http://127.0.0.1:8080/callback",
    "client_id": "yourclientid",
    "slowdown_import": 100,
    "slowdown_export": 100
}

if(typeof module !== 'undefined' && module.exports){
    module.exports = config;
}
