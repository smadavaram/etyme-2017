//'use strict';
function formatUser(company) {
    return "<p>"+ company.name +"</p>"
}
function formatSelectUser(company) {
    return Select2.util.escapeMarkup(company.name);
}

function formatRepo (company) {
    if (company.loading) {
        return company.text;
    }
    var markup = "<p>"+ company.name +"</p>"
    return markup;
}
function formatRepoSelection (company) {
    return company.name || company.text;
}

var set_company_select = function(selector, palce_holder){
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: "/api/select_searches/find_companies",
                dataType: 'json',
                delay: 250,
                data: function (params) {
                    return {
                        per_page: 10,
                        q: params.term, // search term
                        page: params.page
                    };
                },
                processResults: function (data, params) {
                    params.page = params.page || 1;
                    return {
                        results: data.companies,
                        pagination: {
                            more: (params.page * 10) < data.total_count
                        }
                    };
                },
                cache: true
            },
            placeholder: palce_holder,
            escapeMarkup: function (markup) { return markup; },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}


var set_job_candidate_select = function(selector, palce_holder){
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: '/api/select_searches/find_job_applicants',
                dataType: 'json',
                delay: 250,
                data: function (params) {
                    return {
                        per_page: 10,
                        q: params.term, // search term
                        job_id: $("#contract_job_id").val(),
                        page: params.page
                    };
                },
                processResults: function (data, params) {
                    params.page = params.page || 1;
                    return {
                        results: data.companies,
                        pagination: {
                            more: (params.page * 10) < data.total_count
                        }
                    };
                },
                cache: true
            },
            placeholder: palce_holder,
            escapeMarkup: function (markup) { return markup; },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}

var set_user_select = function(selector, palce_holder){
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: '/api/select_searches/find_user_sign',
                dataType: 'json',
                delay: 250,
                data: function (params) {
                    return {
                        per_page: 10,
                        q: params.term, // search term
                        page: params.page
                    };
                },
                processResults: function (data, params) {
                    params.page = params.page || 1;
                    return {
                        results: data.companies,
                        pagination: {
                            more: (params.page * 10) < data.total_count
                        }
                    };
                },
                cache: true
            },
            placeholder: palce_holder,
            multiple: true,
            escapeMarkup: function (markup) { return markup; },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}
