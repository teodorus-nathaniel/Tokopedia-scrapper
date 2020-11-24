const express = require('express');
const fs = require('fs');
const morgan = require('morgan');
const puppeteer = require('puppeteer');
const converter = require('json-2-csv');

const URL = 'https://www.tokopedia.com/nahjkt/product/page/';

const app = express();
app.use(morgan('dev'));

const browser = puppeteer.launch();

const getDataPerPage = async (link) => {
  try {
    const loadedBrowser = await browser;
    const page = await loadedBrowser.newPage();

    page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36'
    );

    await page.goto(link, {
      waitUntil: 'networkidle2',
      timeout: 0,
    });

    const result = await page.evaluate(async () => {
      const mapper = {
        name: '[data-testid="lblPDPDetailProductName"]',
        price: '[data-testid="lblPDPDetailProductPrice"]',
        weight: '[data-testid="PDPDetailWeightValue"]',
      };
      const res = Object.entries(mapper).reduce((acc, [key, value]) => {
        const element = document.querySelector(value);
        acc[key] = element.innerHTML;
        return acc;
      }, {});

      res.price = res.price.replace('.', '')
      res.price = res.price.replace('Rp', '')
      res.weight = res.weight.replace('gr', '')

      const description = JSON.parse(
        document.querySelectorAll(
          'script[data-rh="true"][type="application/ld+json"]'
        )[1].innerHTML
      ).description;
      res.desc = description;

      const images = Array.from(
        document.querySelectorAll('[data-testid="PDPImageThumbnail"]')
      ).map((el) => el.children[0].children[0].src);

      for (let i = 0; i < 5; i++) {
        res[`image${i + 1}`] = images[i] || undefined;
      }
      return res;
    });

    await page.close();

    return result;
  } catch (error) {
    console.log(error);
  }
};

app.route('/links').get((req, res) => {
  (async () => {
    try {
      const loadedBrowser = await browser;
      const page = await loadedBrowser.newPage();
      await page.setViewport({ width: 1920, height: 8000 });

      page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36'
      );

      let i = 1;
      let finalLinks = [];
      while (true) {
        // if(i == 2)  break;
        await page.goto(URL + i, {
          waitUntil: 'networkidle0',
          timeout: 0,
        });

        const result = await page.evaluate(async () => {
          const noProduct = !!document.querySelector(
            'h3.css-1tj59kg-unf-heading.e1qvo2ff3'
          );
          if (noProduct) return null;

          const grid = document.getElementsByClassName('css-tjjb18')[0];
          const res = Array.from(grid.children).map(
            (el) =>
              el.children[0].children[0].children[0].children[0].children[0]
                .children[0].children[0].href
          );
          return res;
        });

        if (!result) break;

        finalLinks = [...finalLinks, ...result];

        i++;
      }

      await page.close();

      const allData = [];
      for (let i = 0; i < finalLinks.length; i++) {
        const link = finalLinks[i];
        const res = await getDataPerPage(link);
        allData.push(res);

        // if(i == 5)  break;
      }

      converter.json2csv(allData, (err, csv) => {
        if (err) {
          throw err;
        }
        fs.writeFileSync('data.csv', csv);
      });

      res.json({
        status: 'success',
        result: allData,
      });
    } catch (error) {
      console.log(error);

      res.json({
        status: 'fail',
        error,
      });
    }
  })();
});

const port = 8000;
app.listen(port, () => {
  console.log(`App running on port ${port}...`);
});
