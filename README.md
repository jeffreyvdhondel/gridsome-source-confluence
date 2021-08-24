# gridsome-source-confluence

> Confluence source for Gridsome.

- [gridsome-source-confluence](#gridsome-source-confluence)
  - [Install](#install)
  - [Usage](#usage)
  - [Options](#options)
  - [Creating pages](#creating-pages)

## Install
yarn:
```bash
yarn add gridsome-source-confluence
```
npm:
```bash
npm install gridsome-source-confluence
```

## Usage

`gridsome.config.js`
```js
module.exports = {
  plugins: [
    {
      use: 'gridsome-source-confluence',
      options: {
        base_url:  "https://example.atlassian.net",
        space_key: "AS",
        debug: true,
        public_only: true,
        rate_limit: true 
      }
    }
  ],
}
```

## Options

| Option | Explanation | Default | Example | Required |
|-|-|-|-|-|
| `base_url` | The base URL of your Confluence instance | - | https://example.atlassian.net | <input type="checkbox" disabled checked /> |
| `space_key` | Force spaceKey(s) comma separated | - | "AX,BG" | <input type="checkbox" disabled /> |
| `public_only` | Only retrieve public confluence pages | false | false | <input type="checkbox" disabled /> |
| `prefix` | Prefix of all types | Confluence | false | <input type="checkbox" disabled /> |
| `username` | Username for the private confluence page | - | johndoe@atlassian.net | required if public_only is false|
| `password` | Password for the private confluence page | - | supersecretpassword | required if public_only is false|
| `rate_limit` | Rate limit request (max concurrent 50) | false | true |<input type="checkbox" disabled /> |
| `debug` | Show debug information | false | true | <input type="checkbox" disabled /> |


## Creating pages

You can automaticly create pages based on the Confluence data.

`gridsome.server.js`
```js
module.exports = function (api) {
  api.createPages(async ({ graphql, createPage }) => {
    const { data } = await graphql(`{
      allConfluenceParent {
        edges {
          node {
            title
            body
            slug
          }
        }
      }
      allConfluenceChild {
        edges {
          node {
            title
            body
            slug
          }
        }
      }
    }`)

    data.allConfluenceParent.edges.forEach(({ node }) => {
      createPage({
        path: `${node.slug}`,
        component: './src/templates/ConfluenceBody.vue',
        context: {
          body: node.body,
          title: node.title
        }
      })
    })

    data.allConfluenceChild.edges.forEach(({ node }) => {
      createPage({
        path: `${node.slug}`,
        component: './src/templates/ConfluenceBody.vue',
        context: {
          body: node.body,
          title: node.title
        }
      })
    })
  })
}
```

`src/templates/ConfluenceBody.vue`
```html
<template>
  <Layout>
    <h1>{{ $context.title }}</h1>
    <div v-html="$context.body"></div>
  </Layout>
</template>
```