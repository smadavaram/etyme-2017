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
            language: {
                noResults: function() {return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#new-contract-company' href='#'>Add New</a>"; }
            },
            placeholder: palce_holder,
            escapeMarkup: function (markup) { return markup; },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}

var set_job_select = function(selector, palce_holder){
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: "/api/select_searches/find_jobs",
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
            language: {
                noResults: function() {return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#new-job' href='#'>Add New</a>"; }
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
                        job_id: $("#select_jobs").val(),
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
            language: {
                noResults: function() {return "No one <a class='pull-right header-btn hidden-mobile' onclick='set_job_application();' >Add New</a>"; }
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

function formatCompanyContact (contact) {
    if (contact.loading) {
        return contact.text;
    }
    var markup = "<div> <table style='width: 100%;'> <td>"+ contact.name +"</td><td> "+ contact.email +"</td><td>"+ contact.phone +"</td><td>"+ contact.department +"</td></table> </div>"
    return markup;
}
function formatCompanyContactSelection (contact) {
    return contact.name || contact.text;
}

var set_company_contacts_select = function(selector, palce_holder, company_type){
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: '/api/select_searches/find_contacts',
                dataType: 'json',
                delay: 250,
                data: function (params) {
                    return {
                        per_page: 10,
                        q: params.term, // search term
                        company_id: $(company_type).val(),
                        page: params.page
                    };
                },
                processResults: function (data, params) {
                    params.page = params.page || 1;
                    return {
                        results: data.contacts,
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
            templateResult: formatCompanyContact,
            templateSelection: formatCompanyContactSelection
        });
    }
}

var set_candidate_select = function(selector, palce_holder){
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: "/api/select_searches/find_candidates",
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
            language: {
                noResults: function() {return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#candidate-new-modal' href='#'>Add New</a>"; }
            },
            placeholder: palce_holder,
            escapeMarkup: function (markup) { return markup; },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}

function set_job_application(){
    $.ajax({
        url: '/contracts/set_job_application',
        dataType: 'script',
        data: {job_id:  $("#select_jobs").val()}
    });
}