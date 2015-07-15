$(document).ready(function() {



  // INITIALIZATION
  // ==============

  // Replace with your own values
  var APPLICATION_ID = 'EW4ETT1B5U';
  var SEARCH_ONLY_API_KEY = '3613a38e1f9b8d2c8fd612b24c086fd9';
  var INDEX_NAME = 'newitems';
  var HITS_PER_PAGE = 10;
  var MAX_VALUES_PER_FACET = 8;
  var FACET_CONFIG = [
  { name: 'countryid', title: 'Country', disjunctive: false, sortFunction: sortByCountDesc },
  { name: 'salepriorityendd_timestamp', title: 'Sale Priority End', disjunctive: true, type: 'slider' },
  { name: 'saleprioritystartdate_timestamp', title: 'Sale Priority Start', disjunctive: true, type: 'slider' },
  { name: 'saleregularenddate_timestamp', title: 'Sale Regular End', disjunctive: true, type: 'slider' },
  { name: 'saleregularstartdate_timestamp', title: 'Sale Reguler Start', disjunctive: true, type: 'slider' },
  { name: 'taxonomypath', title: 'Taxonomy', disjunctive: false, sortFunction: sortByCountDesc }
  ];

  // Client + Helper initialization
  var algolia = algoliasearch(APPLICATION_ID, SEARCH_ONLY_API_KEY);
  var params = {
    hitsPerPage: HITS_PER_PAGE,
    maxValuesPerFacet: MAX_VALUES_PER_FACET,
    facets: $.map(FACET_CONFIG, function(facet) { return !facet.disjunctive ? facet.name : null; }),
    disjunctiveFacets: $.map(FACET_CONFIG, function(facet) { return facet.disjunctive ? facet.name : null; })
  };
  var algoliaHelper = algoliasearchHelper(algolia, INDEX_NAME, params);

  // DOM binding
  var $inputField = $('#search-input');
  var $autocompleteField = $('#aq');
  var $hits = $('#hits');
  var $stats = $('#stats');
  var $facets = $('#facets');
  var $pagination = $('#pagination');

  // Hogan templates binding
  var hitTemplate        = Hogan.compile($('#hit-template').text());
  var statsTemplate      = Hogan.compile($('#stats-template').text());
  var facetTemplate      = Hogan.compile($('#facet-template').text());
  var sliderTemplate     = Hogan.compile($('#slider-template').text());
  var paginationTemplate = Hogan.compile($('#pagination-template').text());
  var itemSuggestionTemplate = Hogan.compile($('#item-suggestion-template').text());
  var saleSuggestionTemplate = Hogan.compile($('#sale-suggestion-template').text());



  // AUTOCOMPLETE
  // ============

  $autocompleteField.typeahead({ hint: false, highlight: false }, [
  {
    name: 'sales',
    source: algolia.initIndex('sales').ttAdapter({ hitsPerPage: 3 }),
    templates: {
      header: '<h3 class="tt-header">Sales</h3>',
      suggestion: saleSuggestionTemplate.render.bind(saleSuggestionTemplate)
    }
  },
  {
    name: 'items',
    source: algolia.initIndex('newitems').ttAdapter({ hitsPerPage: 3 }),
    templates: {
      header: '<h3 class="tt-header">Items</h3>',
      suggestion: itemSuggestionTemplate.render.bind(itemSuggestionTemplate)
    }
  }
  ]);
  $autocompleteField.on('keyup', function() {
    $('#autocomplete-icon').toggleClass('empty', $(this).val().trim());
  });
  $(document).on('click', '#autocomplete-icon',function(e) {
    e.preventDefault();
    $autocompleteField.val('').keyup().focus();
  });



  // SEARCH BINDING
  // ==============

  // Input binding
  $inputField
  .on('keyup', function() {
    var query = $(this).val();
    toggleIconEmptyInput(!query.trim());
    algoliaHelper.setQuery(query).search();
  })
  .focus();

  // Search errors
  algoliaHelper.on('error', function(error) {
    console.log(error);
  });

  // Search results
  algoliaHelper.on('result', function(content, state) {
    renderStats(content);
    renderHits(content);
    renderFacets(content, state);
    bindSearchObjects(state);
    renderPagination(content);
  });

  // Initial search
  algoliaHelper.search();



  // RENDER SEARCH COMPONENTS
  // ========================

  function renderStats(content) {
    var stats = {
      nbHits: numberWithDelimiter(content.nbHits),
      nbHits_plural: content.nbHits !== 1,
      processingTimeMS: content.processingTimeMS
    };
    $stats.html(statsTemplate.render(stats));
  }

  function renderHits(content) {
    $hits.html(hitTemplate.render(content));
  }

  function renderFacets(content, state) {
    var facetsHtml = '';
    for (var facetIndex = 0; facetIndex < FACET_CONFIG.length; ++facetIndex) {
      var facetParams = FACET_CONFIG[facetIndex]; 
      var facetName   = facetParams.name;
      var facetTitle  = facetParams.title;
      var facetType   = facetParams.type || '';
      var facetResult = content.getFacetByName(facetName);
      if (!facetResult) continue;
      var facetContent = {};

      // Slider facets
      if (facetType === 'slider') {
        facetContent = {
          facet: facetName,
          title: facetTitle
        };
        facetContent.min = facetResult.stats.min;
        facetContent.max = facetResult.stats.max + 1;
        var from = state.getNumericRefinement(facetName, '>=') || facetContent.min;
        var to   = state.getNumericRefinement(facetName, '<=') || facetContent.max;
        facetContent.from = Math.min(facetContent.max, Math.max(facetContent.min, from));
        facetContent.to   = Math.min(facetContent.max, Math.max(facetContent.min, to));
        facetsHtml +=  sliderTemplate.render(facetContent);
      }

      // Conjunctive + Disjunctive facets
      else {
        var values = [];
        for (var value in facetResult.data) {
          values.push({
            label: value,
            value: value,
            count: facetResult.data[value],
            refined: algoliaHelper.isRefined(facetName, value)
          });
        }
        var sortFunction = facetParams.sortFunction || sortByCountDesc;
        if (facetParams.topListIfRefined) sortFunction = sortByRefined(sortFunction);
        values.sort(sortFunction);
        facetContent = {
          facet: facetName,
          title: facetTitle,
          values: values,
          disjunctive: facetParams.disjunctive
        };
        facetsHtml += facetTemplate.render(facetContent);
      }
    }
    $facets.html(facetsHtml);
  }

  function bindSearchObjects(state) {
    // Bind Sliders
    var sliders = $.map(FACET_CONFIG, function(facet) { return (facet.type && facet.type === 'slider') ? facet.name : null; });
    for (facetIndex = 0; facetIndex < sliders.length; ++facetIndex) {
      (function() {
        var facetName = sliders[facetIndex];
        var slider = $('#'+facetName+'-slider');
        var sliderOptions = {
          type: "double",
          grid: true,
          min:  slider.data('min'),
          max:  slider.data('max'),
          from: slider.data('from'),
          to:   slider.data('to'),
          prettify: function (num) {
            return '#' + num;
          },
          onFinish: function (data) {
            console.log(facetName, data);
            if (data.from !== (state.getNumericRefinement(facetName, '>=') || data.min)) {
              algoliaHelper.addNumericRefinement(facetName, '>=', data.from).search();
            }
            if (data.to !== (state.getNumericRefinement(facetName, '<=') || data.max)) {
              algoliaHelper.addNumericRefinement(facetName, '<=', data.to).search();
            }
          }
        };
        console.log(sliderOptions);
        slider.ionRangeSlider(sliderOptions);
      })(facetIndex);
    }
  }

  function renderPagination(content) {
    var pages = [];
    if (content.page > 3) {
      pages.push({ current: false, number: 1 });
      pages.push({ current: false, number: '...', disabled: true });
    }
    for (var p = content.page - 3; p < content.page + 3; ++p) {
      if (p < 0 || p >= content.nbPages) continue;
      pages.push({ current: content.page === p, number: p + 1 });
    }
    if (content.page + 3 < content.nbPages) {
      pages.push({ current: false, number: '...', disabled: true });
      pages.push({ current: false, number: content.nbPages });
    }
    var pagination = {
      pages: pages,
      prev_page: content.page > 0 ? content.page : false,
      next_page: content.page + 1 < content.nbPages ? content.page + 2 : false
    };
    $pagination.html(paginationTemplate.render(pagination));
  }



  // EVENTS BINDING
  // ==============

  $(document).on('click', 'a.toggle-refine', function(e) {
    e.preventDefault();
    algoliaHelper.toggleRefine($(this).data('facet'), $(this).data('value')).search();
  });
  $(document).on('click', '.go-to-page', function(e) {
    e.preventDefault();
    $('html, body').animate({scrollTop:0}, '500', 'swing');
    algoliaHelper.setCurrentPage(+$(this).data('page') - 1).search();
  });
  $(document).on('click', '#search-input-icon',function(e) {
    e.preventDefault();
    $inputField.val('').keyup().focus();
  });


  // HELPER METHODS
  // ==============

  function toggleIconEmptyInput(isEmpty) {
    $('#search-input-icon').toggleClass('empty', !isEmpty);
  }
  function numberWithDelimiter(number, delimiter) {
    number = number + '';
    delimiter = delimiter || ',';
    var split = number.split('.');
    split[0] = split[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + delimiter);
    return split.join('.');
  }
  function sortByRefined (sortFunction) {
    return function (a, b) {
      if (a.refined !== b.refined) {
        if (a.refined) return -1;
        if (b.refined) return 1;
      }
      return sortFunction(a, b);
    };
  }
  function sortByCountDesc (a, b) {
    return b.count - a.count;
  }
  function sortByName (a, b) {
    return a.value.localeCompare(b.value);
  }


});

