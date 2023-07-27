const Canvas = require('@napi-rs/canvas');

const createPokemonImage = async (imageUrl, isHidden) => {
    const canvas = Canvas.createCanvas(1200, 1200);
    const context = canvas.getContext('2d');

    const background = await Canvas.loadImage('./img/pokemontemplate2.png');
    context.drawImage(background, 0, 0, canvas.width, canvas.height);

    let foreground = await Canvas.loadImage(imageUrl);

    if (isHidden) {
        foreground = await Canvas.loadImage(await createSilhouetteFromImage(foreground));
    }

    context.drawImage(foreground, 210, 200, 800, 800);

    return await canvas.encode('png');
}

const createSilhouetteFromImage = async (image) => {
    const canvas = Canvas.createCanvas(800, 800);
    const context = canvas.getContext('2d');

    const figureToSilhouette = await Canvas.loadImage(image);
    context.drawImage(figureToSilhouette, 0, 0, canvas.width, canvas.height);

    let pixels = context.getImageData(0, 0, canvas.width, canvas.height);

    for (let index = 0; index < pixels.data.length; index += 4) {
        // Red
        pixels.data[index] = 0;
        // Blue
        pixels.data[index + 1] = 0;
        // Green
        pixels.data[index + 2] = 0;
        // Alpha Transparency
        pixels.data[index + 3] = pixels.data[index + 3];
    }

    context.putImageData(pixels, 0, 0);

    return await canvas.encode('png');
}

module.exports = {createPokemonImage}
