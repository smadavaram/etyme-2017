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
    var photo_path = user.photo === undefined ? '/assets/avatars/male-6fdb3297a97307d20273866196068e696682f523355db573e7d5bd8581ab763e.png' : user.photo;
    var markup = "<div> <table style='width: 100%;'><td><img src='" + photo_path + "'></td> <td>" + user.full_name + "</td><td> " + user.email + "</td><td>" + user.phone + "</td></table> </div>"

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

// sell side  company contract admins fatch     set_sell_company_contract_admins
var set_contract_admins = function (selector, place_holder) {
    var company = place_holder.split("-");
    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: '/api/select_searches/find_hr_admins?company='+company[1],
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
    var company = place_holder.split("-");

    if ($(selector).length > 0) {
        $(selector).select2({
            ajax: {
                url: '/api/select_searches/find_contacts?company='+company[1],
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
            placeholder: place_holder.split("-")[0],
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




var set_company_reporting_manger = function (selector, place_holder, company_type) {
    var company = place_holder.split("-");
    var REGEX_EMAIL = "^[^@\s]+@[^@\s\.]+\.[^@\.\s]+$"
    console.log('got request');
    $.ajax({
        url: '/api/select_searches/find_reporting_manger?company='+company[1],
        type: "GET",
        dataType: "json",
        success: function (data) {
            let element = null;
            if(jQuery('#select_clients').val())
            {
                element = jQuery('#selectize_sell_client_contacts');
            }else{
                element = jQuery('#selectize_sell_company_contacts');
            }
            if(element[0].selectize){
                element[0].selectize.destroy();
            }
            $('#selectize_sell_company_contacts').selectize(
                {
                persist: false,
                maxItems: 1,
                valueField: 'id',
                labelField: 'name',
                searchField: ['name', 'email'],
                options: data.contacts,
                render: {
                    item: function(item, escape) {
                        return '<div>' +
                            (item.name ? '<span class="name">' + escape(item.name) + '</span> &nbsp;' : '') +
                            (item.email ? '<span class="email">' + '&lt' + escape(item.email) + '&gt' + '</span>' : '') +
                            '</div>';
                    },
                    option: function(item, escape) {
                        var label = item.name || item.email;
                        var caption = item.name ? item.email : null;
                        return '<div>' +
                            '<span class="label">' + escape(label) + '</span> &nbsp;' +
                            (caption ? '<span class="caption">' + '&lt' +  escape(caption) + '&gt' + '</span>' : '') +
                            '</div>';
                    }
                },
                createFilter: function(input) {
                    var match, regex;

                    // email@address.com
                    regex = new RegExp('^' + REGEX_EMAIL + '$', 'i');
                    match = input.match(regex);
                    if (match) return !this.options.hasOwnProperty(match[0]);

                    // name <email@address.com>
                    regex = new RegExp('^([^<]*)\<' + REGEX_EMAIL + '\>$', 'i');
                    match = input.match(regex);
                    if (match) return !this.options.hasOwnProperty(match[2]);

                    return false;
                },
                create: function(input) {
                    if ((new RegExp('^' + REGEX_EMAIL + '$', 'i')).test(input)) {
                        return {email: input, id: input};
                    }
                    var match = input.match(new RegExp('^([^<]*)\<' + REGEX_EMAIL + '\>$', 'i'));
                    if (match) {
                        return {
                            email : match[2],
                            name  : $.trim(match[1])
                        };
                    }
                    alert('Invalid email address.');
                    return false;
                }
            });
        }
    });

    // if ($(selector).length > 0) {
    //     $(selector).select2({
    //         ajax: {
    //             url: '/api/select_searches/find_reporting_manger?company='+company[1],
    //             dataType: 'json',
    //             delay: 250,
    //             data: function (params) {
    //                 return {
    //                     per_page: 10,
    //                     q: params.term, // search term
    //                     page: params.page
    //                 };
    //             },
    //             processResults: function (data, params) {
    //                 params.page = params.page || 1;
    //                 return {
    //                     results: data.contacts,
    //                     pagination: {
    //                         more: (params.page * 10) < data.total_count
    //                     }
    //                 };
    //             },
    //             cache: true
    //         },
    //         placeholder: place_holder.split("-")[0],
    //         language: {
    //             noResults: function () {
    //                 return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#new-company-contacts-modal' href='#'>Add New</a>";
    //             }
    //         },
    //         multiple: true,
    //         escapeMarkup: function (markup) {
    //             return markup;
    //         },
    //         templateResult: formatCompanyContact,
    //         templateSelection: formatCompanyContactSelection
    //     });
    // }
}
var set_client_reporting_manger = function (selector, place_holder, company_type) {
    var company = place_holder.split("-");
    var REGEX_EMAIL = "^[^@\s]+@[^@\s\.]+\.[^@\.\s]+$"
    console.log('got request');
    $.ajax({
        url: '/api/select_searches/find_reporting_manger?company='+company[1],
        type: "GET",
        dataType: "json",
        success: function (data) {
            let element = jQuery('#selectize_sell_client_contacts');

            if(element[0].selectize){
                element[0].selectize.destroy();
            }
            $('#selectize_sell_client_contacts').selectize(
                {
                persist: false,
                maxItems: 1,
                valueField: 'id',
                labelField: 'name',
                searchField: ['name', 'email'],
                options: data.contacts,
                render: {
                    item: function(item, escape) {
                        return '<div>' +
                            (item.name ? '<span class="name">' + escape(item.name) + '</span> &nbsp;' : '') +
                            (item.email ? '<span class="email">' + '&lt' + escape(item.email) + '&gt' + '</span>' : '') +
                            '</div>';
                    },
                    option: function(item, escape) {
                        var label = item.name || item.email;
                        var caption = item.name ? item.email : null;
                        return '<div>' +
                            '<span class="label">' + escape(label) + '</span> &nbsp;' +
                            (caption ? '<span class="caption">' + '&lt' +  escape(caption) + '&gt' + '</span>' : '') +
                            '</div>';
                    }
                },
                createFilter: function(input) {
                    var match, regex;

                    // email@address.com
                    regex = new RegExp('^' + REGEX_EMAIL + '$', 'i');
                    match = input.match(regex);
                    if (match) return !this.options.hasOwnProperty(match[0]);

                    // name <email@address.com>
                    regex = new RegExp('^([^<]*)\<' + REGEX_EMAIL + '\>$', 'i');
                    match = input.match(regex);
                    if (match) return !this.options.hasOwnProperty(match[2]);

                    return false;
                },
                create: function(input) {
                    if ((new RegExp('^' + REGEX_EMAIL + '$', 'i')).test(input)) {
                        return {email: input, id: input};
                    }
                    var match = input.match(new RegExp('^([^<]*)\<' + REGEX_EMAIL + '\>$', 'i'));
                    if (match) {
                        return {
                            email : match[2],
                            name  : $.trim(match[1])
                        };
                    }
                    alert('Invalid email address.');
                    return false;
                }
            });
        }
    });

    // if ($(selector).length > 0) {
    //     $(selector).select2({
    //         ajax: {
    //             url: '/api/select_searches/find_reporting_manger?company='+company[1],
    //             dataType: 'json',
    //             delay: 250,
    //             data: function (params) {
    //                 return {
    //                     per_page: 10,
    //                     q: params.term, // search term
    //                     page: params.page
    //                 };
    //             },
    //             processResults: function (data, params) {
    //                 params.page = params.page || 1;
    //                 return {
    //                     results: data.contacts,
    //                     pagination: {
    //                         more: (params.page * 10) < data.total_count
    //                     }
    //                 };
    //             },
    //             cache: true
    //         },
    //         placeholder: place_holder.split("-")[0],
    //         language: {
    //             noResults: function () {
    //                 return "No results <a class='pull-right header-btn hidden-mobile' data-toggle='modal' data-target='#new-company-contacts-modal' href='#'>Add New</a>";
    //             }
    //         },
    //         multiple: true,
    //         escapeMarkup: function (markup) {
    //             return markup;
    //         },
    //         templateResult: formatCompanyContact,
    //         templateSelection: formatCompanyContactSelection
    //     });
    // }
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
