const {Scraper} =  require("@the-convocation/twitter-scraper");


const twitterScraper = new Scraper({
        transform: {
            request(input, init) {
                // The arguments here are the same as the parameters to fetch(), and
                // are kept as-is for flexibility of both the library and applications.
                if (input instanceof URL) {
                    const proxy =
                        "https://corsproxy.io/?" +
                        encodeURIComponent(input.toString());
                    return [proxy, init];
                } else if (typeof input === "string") {
                    const proxy =
                        "https://corsproxy.io/?" + encodeURIComponent(input);
                    return [proxy, init];
                } else {
                    // Omitting handling for example
                    throw new Error("Unexpected request input type");
                }
            }
            ,
        },
    })
;


module.exports = {
    twitterScraper
}
