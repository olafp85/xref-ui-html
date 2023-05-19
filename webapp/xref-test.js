'use strict';

mocha.setup('bdd'); // minimal setup
let assert = chai.assert; // https://www.chaijs.com/api/assert

describe("importVertex", function() {
  it(`Transforms 'a' to {data: {id:'a'}}`, function() {
    assert.deepEqual(importVertex('a'), {
      data: {
        id: 'a',
      }
    });
  });

  it(`Transforms ID '\\PR:PROG\\TY:CLASS\\ME:METHOD' to 'pr:prog | ty:class | me:method'`,
    function() {
      assert.deepEqual(importVertex('\\PR:PROG\\TY:CLASS\\ME:METHOD').data.id, 'pr:prog | ty:class | me:method');
    });
});

describe("vertexComponents", function() {
  it(`Transforms 'pr:prog | ty:class | me:method' to [[pr,prog],[ty,class],[me,method]]`, function() {
    assert.deepEqual(vertexComponents('pr:prog | ty:class | me:method'), [
      ['pr', 'prog'],
      ['ty', 'class'],
      ['me', 'method']
    ]);
  });
});

describe("importEdges", function() {
  it(`Transforms [['a','b'],['b','c']] to an array with 2 edges`, function() {
    assert.deepEqual(importEdges([
      ['a', 'b'],
      ['b', 'c']
    ]), [
      { data: { id: 'a -> b', source: 'a', target: 'b' } },
      { data: { id: 'b -> c', source: 'b', target: 'c' } }
    ]);
  });
});

describe("importGraph", function() {
  it(`Transforms 'a\\tb\\nb\\tc' to a graph-object`, function() {
    assert.deepEqual(importGraph('a\tb\nb\tc'), {
      nodes: [{
          data: {
            id: 'a'
          }
        },
        {
          data: {
            id: 'b'
          }
        },
        {
          data: {
            id: 'c'
          }
        },
      ],
      edges: [{
          data: {
            id: 'a -> b',
            source: 'a',
            target: 'b'
          }
        },
        {
          data: {
            id: 'b -> c',
            source: 'b',
            target: 'c'
          },
        },
      ],
    });
  });
});

mocha.run();
