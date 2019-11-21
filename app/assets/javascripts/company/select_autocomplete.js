//'use strict';
function formatUser(company) {
    return "<p>" + company.name + "</p>"
}

function formatSelectUser(company) {
    return Select2.util.escapeMarkup(company.name);
}

function formatRepo(company) {
    if (company.loading) {
        return company.text;
    }
    var markup = "<p>" + company.name + "</p>"
    return markup;
}

function formatRepoSelection(company) {
    return company.name || company.text;
}

var set_company_select = function (selector, place_holder) {
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
                noResults: function () {
                    return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#new-contract-company' href='#'>Add New</a>";
                }
            },
            placeholder: place_holder,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}

var set_client_company_select = function (selector, place_holder) {
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: "/api/select_searches/find_client_companies",
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
                    // debugger;
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
                noResults: function () {
                    return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#new-contract-company' href='#'>Add New</a>";
                }
            },
            placeholder: place_holder,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}

var set_job_select = function (selector, place_holder) {
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
                            more: ((params.page * 10) < data.total_count)
                        }
                    };
                },
                cache: true
            },
            language: {
                noResults: function () {
                    return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#new-job' href='#'>Add New</a>";
                }
            },
            placeholder: place_holder,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}

var set_job_candidate_select = function (selector, place_holder, job_id) {
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
                        job_id: !!job_id ? job_id : $("#select_jobs").val(),
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
                noResults: function () {
                    return "No one <a class='pull-right header-btn hidden-mobile' onclick='set_job_application(job_id);' >Add New</a>";
                }
            },
            placeholder: place_holder,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}

var set_user_select = function (selector, place_holder) {
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
            placeholder: place_holder,
            multiple: true,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}


var set_commission_user_select = function (selector, place_holder) {
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: '/api/select_searches/find_commission_user',
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
            placeholder: place_holder,
            multiple: false,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}

var set_expense_type_select = function (selector, place_holder) {
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: "/api/select_searches/find_expense_type",
                dataType: 'json',
                delay: 250,
                data: function (params) {
                    return {
                        // per_page: 10,
                        q: params.term//, // search term
                        // page: params.page
                    };
                },
                processResults: function (data, params) {
                    // params.page = params.page || 1;

                    return {
                        results: data
                    };
                },
                cache: true
            },
            language: {
                noResults: function () {
                   if (!place_holder.includes('expense')){
                       return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#new-expense-type' href='#'>Add New</a>";
                   }
                }
            },
            placeholder: place_holder,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}


var set_company_admin = function (selector) {
    if ($(selector).length > 0) {
        $(selector).select2({
            placeholderOption: 'first',

            ajax: {
                url: "/api/select_searches/find_company_admin",
                dataType: 'json',
                delay: 250,
                data: function (params) {
                    return {
                        // per_page: 10,
                        q: params.term//, // search term
                        // page: params.page
                    };
                },
                processResults: function (data, params) {
                    // params.page = params.page || 1;
                    return {
                        results: data
                    };
                },
                cache: true
            },
            language: {
                noResults: function () {
                    return "No results <a class='btn btn-success btn-md pull-right header-btn hidden-mobile' data-remote='true' href='/admins/new'>Add new</a>";
                }
            },
            placeholderOption: 'first',

            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatCompanyAdmin,
            templateSelection: formatCompanyAdminSelection,

        });
    }
}

var set_company_candidate = function (selector) {
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: "/api/select_searches/find_commission_candidates",
                dataType: 'json',
                delay: 250,
                data: function (params) {
                    return {
                        // per_page: 10,
                        q: params.term//, // search term
                        // page: params.page
                    };
                },
                processResults: function (data, params) {
                    // params.page = params.page || 1;
                    return {
                        results: data
                    };
                },
                cache: true
            },
            language: {
                noResults: function () {
                    return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#candidate-new-modal' href='#''>Add New</a>";
                }
            },
            placeholderOption: 'first',

            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatCompanyAdmin,
            templateSelection: formatCompanyAdminSelection,
        });
    }
}

function formatCompanyAdmin(candidate) {
    if (candidate.loading) {
        return candidate.text;
    }
    var markup = "<p>" + candidate.first_name + ' ' + candidate.last_name + "</p>"
    return markup;
}

function formatCompanyAdminSelection(candidate) {
    return candidate.first_name + ' ' + candidate.last_name || candidate.text;
}


function formatCompanyUser(user) {
    if (user.loading) {
        return user.text;
    }
    var markup = "<div> <table style='width: 100%;'> <td>" + user.full_name + "</td><td> " + user.email + "</td><td>" + user.phone + "</td></table> </div>"
    return markup;
}

function formatCompanyContact(contact) {
    if (contact.loading) {
        return contact.text;
    }
    var markup = "<div> <table style='width: 100%;'> <td>" + contact.name + "</td><td> " + contact.email + "</td><td>" + contact.phone + "</td><td>" + contact.department + "</td></table> </div>"
    return markup;
}

function formatHrAdmins(user) {
    if (user.loading) {
        return user.text;
    }
    var markup = "<div> <table style='width: 100%;'> <td>" + user.full_name + "</td><td> " + user.email + "</td><td>" + user.phone + "</td></table> </div>"
    return markup;
}

function formatCompanyUserSelection(user) {
    return user.full_name || user.email;
}

function formatHrAdminsSelection(user) {
    return user.full_name || user.email;
}

function formatCompanyContactSelection(contact) {
    return contact.name || contact.text;
}

var company_contract_signers = function (selector, company_id) {
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: "/api/select_searches/find_signers?company_id=" + company_id,
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
                        results: data.users,
                        pagination: {
                            more: (params.page * 10) < data.total_count
                        }
                    };
                },
                cache: true
            },
            placeholder: "Please Select Signers",
            language: {
                noResults: function () {
                    return "No results";
                }
            },
            multiple: true,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatCompanyUser,
            templateSelection: formatCompanyUserSelection
        });

    }
};

var set_company_users_select = function (selector, place_holder, company_type) {
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: '/api/select_searches/find_users',
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
                        results: data.users,
                        pagination: {
                            more: (params.page * 10) < data.total_count
                        }
                    };
                },
                cache: true
            },
            placeholder: place_holder,
            language: {
                noResults: function () {
                    return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#new-company-contacts-modal' href='#'>Add New</a>";
                }
            },
            multiple: true,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatCompanyUser,
            templateSelection: formatCompanyUserSelection
        });
    }
};
var set_contract_admins = function (selector, place_holder) {
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: '/api/select_searches/find_hr_admins',
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
                        results: data.users,
                        pagination: {
                            more: (params.page * 10) < data.total_count
                        }
                    };
                },
                cache: true
            },
            placeholder: place_holder,
            language: {
                noResults: function () {
                    return "No results <a class='pull-right header-btn hidden-mobile' target='_blank' href='/admins'>Add Admin</a>";
                }
            },
            multiple: true,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatHrAdmins,
            templateSelection: formatHrAdminsSelection
        });
    }
}


var set_company_contacts_select = function (selector, place_holder, company_type) {
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
            placeholder: place_holder,
            language: {
                noResults: function () {
                    return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#new-company-contacts-modal' href='#'>Add New</a>";
                }
            },
            multiple: true,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatCompanyContact,
            templateSelection: formatCompanyContactSelection
        });
    }
}

var set_candidate_select = function (selector, place_holder) {
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
                noResults: function () {
                    return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#candidate-new-modal' href='#'>Add New</a>";
                }
            },
            placeholder: place_holder,
            escapeMarkup: function (markup) {
                return markup;
            },
            templateResult: formatRepo,
            templateSelection: formatRepoSelection
        });
    }
}

function set_job_application(id) {
    $.ajax({
        url: '/contracts/set_job_application',
        dataType: 'script',
        data: {job_id: !!id ? id : $("#select_jobs").val()}
    });
}
