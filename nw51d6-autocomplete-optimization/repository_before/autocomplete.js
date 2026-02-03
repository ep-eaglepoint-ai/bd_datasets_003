class ProductSearch {
    constructor(products = []) {
        this.products = products;
    }

    addProduct(product) {
        this.products.push(product);
    }

    addProducts(products) {
        this.products.push(...products);
    }

    searchProducts(query, limit = 10) {
        if (!query || query.trim().length === 0) {
            return [];
        }

        const searchTerm = query.toLowerCase().trim();
        const matches = [];

        for (let i = 0; i < this.products.length; i++) {
            const product = this.products[i];
            const productName = product.name.toLowerCase();

            if (productName.startsWith(searchTerm)) {
                matches.push({
                    id: product.id,
                    name: product.name,
                    score: product.score,
                    matchType: 'prefix',
                    relevance: 100 + product.score
                });
            } else if (productName.includes(searchTerm)) {
                matches.push({
                    id: product.id,
                    name: product.name,
                    score: product.score,
                    matchType: 'contains',
                    relevance: 50 + product.score
                });
            }
        }

        matches.sort((a, b) => b.relevance - a.relevance);

        return matches.slice(0, limit).map(m => ({
            id: m.id,
            name: m.name,
            score: m.score,
            matchType: m.matchType
        }));
    }

    getByCategory(category) {
        return this.products.filter(p => p.category === category);
    }

    countMatches(prefix) {
        if (!prefix) return 0;

        const searchTerm = prefix.toLowerCase();
        let count = 0;

        for (const product of this.products) {
            if (product.name.toLowerCase().includes(searchTerm)) {
                count++;
            }
        }

        return count;
    }
}

function generateTestProducts(count) {
    const adjectives = ['Wireless', 'Premium', 'Ultra', 'Pro', 'Classic', 'Modern', 'Smart', 'Portable', 'Heavy-Duty', 'Compact'];
    const nouns = ['Headphones', 'Speaker', 'Keyboard', 'Mouse', 'Monitor', 'Charger', 'Cable', 'Stand', 'Hub', 'Adapter'];
    const brands = ['TechCo', 'AudioMax', 'DigitalPro', 'SmartGear', 'ElectroHub', 'ByteWare', 'SoundWave', 'PixelPerfect'];
    const categories = ['electronics', 'audio', 'accessories', 'computing', 'mobile'];

    const products = [];

    for (let i = 0; i < count; i++) {
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const brand = brands[Math.floor(Math.random() * brands.length)];

        products.push({
            id: `prod_${String(i).padStart(6, '0')}`,
            name: `${brand} ${adj} ${noun} ${i}`,
            category: categories[Math.floor(Math.random() * categories.length)],
            score: Math.floor(Math.random() * 100)
        });
    }

    return products;
}

async function simulateTyping(search, word) {
    console.log(`\nSimulating typing "${word}" character by character:\n`);

    let totalTime = 0;

    for (let i = 1; i <= word.length; i++) {
        const partial = word.substring(0, i);
        const start = performance.now();
        const results = search.searchProducts(partial);
        const elapsed = performance.now() - start;
        totalTime += elapsed;

        console.log(`  "${partial}" -> ${elapsed.toFixed(2)}ms (${results.length} results)`);
    }

    console.log(`\n  Total time for ${word.length} keystrokes: ${totalTime.toFixed(2)}ms`);
    console.log(`  Average per keystroke: ${(totalTime / word.length).toFixed(2)}ms`);
}

if (typeof require !== 'undefined' && require.main === module) {
    const productCount = 50000;
    console.log(`Generating ${productCount.toLocaleString()} test products...`);

    const products = generateTestProducts(productCount);
    const search = new ProductSearch(products);

    console.log('Products generated.\n');
    console.log('=' + '='.repeat(59));
    console.log('Benchmarking search performance:\n');

    const queries = ['wire', 'wireless', 'TechCo Pro', 'a', 'xyz'];

    for (const query of queries) {
        const start = performance.now();
        const results = search.searchProducts(query);
        const elapsed = performance.now() - start;

        console.log(`Query "${query}": ${elapsed.toFixed(2)}ms - Found ${results.length} results`);
    }

    simulateTyping(search, 'wireless');

    console.log('\n' + '='.repeat(60));
    console.log('ISSUE: Each keystroke triggers a full O(n) scan of all products.');
    console.log('       For 50,000 products, typing a 8-letter word causes 8 scans.');
    console.log('       Response times exceed 50ms target, causing noticeable lag.');
    console.log('='.repeat(60));
}

module.exports = { ProductSearch, generateTestProducts };
