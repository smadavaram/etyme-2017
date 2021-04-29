$(document).ready(function () {
    jQuery.fn.dataTable.render.ellipsis = function (cutoff, wordbreak, escapeHtml) {
        var esc = function (t) {
            return t
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        };

        return function (d, type, row) {
            // Order, search and type get the original data
            if (type !== 'display') {
                return d;
            }

            if (typeof d !== 'number' && typeof d !== 'string') {
                return d;
            }

            d = d.toString(); // cast numbers

            if (d.length <= cutoff) {
                return d;
            }

            var shortened = d.substr(0, cutoff - 1);

            // Find the last white space character in the string
            if (wordbreak) {
                shortened = shortened.replace(/\s([^\s]*)$/, '');
            }

            // Protect against uncontrolled HTML input
            if (escapeHtml) {
                shortened = esc(shortened);
            }

            return '<span class="ellipsis" title="' + esc(d) + '">' + shortened + '&#8230;</span>';
        };
    };
    $('#company-contacts-datatable').dataTable({
        "drawCallback": function (settings) {
            addeventatc.refresh();
        },
        processing: true,
        serverSide: true,
        order: [[1, "desc"]],
        columnDefs: [{
            'targets': 0,
            searchable: false,
            orderable: false,
            'render': function (data, type, full, meta) {
                return '<input type="checkbox" name="id[]" value="' + full.id + '">';
            }
        },
            {
                'targets': 2,
                searchable: true,
                orderable: true,
                'createdCell': function (td, cellData, rowData, row, col) {
                    $(td).addClass('text-left no-wrap');
                }
            }
        ],
        ajax: $('#company-contacts-datatable').data('source'),
        columns: [
            {
                data: "id",
                searchable: false,
                orderable: false

            },
            {data: "name"},
            {data: "first_name"},
            {data: "title"},
            {
                data: "groups",
                searchable: false,
                orderable: false
            },
            {
                data: "reminder_note",
                searchable: false,
                orderable: false
            },
            {
                data: "status",
                searchable: false,
                orderable: false
            },
            {
                data: "contact",
                searchable: false,
                orderable: false
            },
            {
                data: "actions",
                searchable: false,
                orderable: false
            }
        ]
    });
    $('#job_application_dataTable').dataTable({
        columnDefs: [{
            'targets': 0,
            searchable: false,
            orderable: false,
            'render': function (data, type, full, meta) {
                return '<input type="checkbox" name="id[]" value="' + full.id + '">';
            }
        },
            {
                'targets': [1],
                searchable: true,
                orderable: true,
                'createdCell': function (td, cellData, rowData, row, col) {
                    $(td).addClass('text-left');
                }
            }
        ]
    });

    $('#jobs_datatable').dataTable({
        columnDefs: [{
            'targets': 0,
            searchable: false,
            orderable: false
        }]
    });

    $('#prefer_vendors_table').dataTable();
    $('#prefer_vendors_table-search').keyup(function () {
        $('#prefer_vendors_table').DataTable().search($(this).val()).draw();
        default_active_nav('.ln-4');
    });
    $('#receive_prefer_vendors_table').dataTable();
    $('#receive_prefer_vendors_table-search').keyup(function () {
        $('#receive_prefer_vendors_table').DataTable().search($(this).val()).draw();
        default_active_nav('.ln-4');
    });
    $('#network_prefer_vendors_table').dataTable();
    $('#network_prefer_vendors_table-search').keyup(function () {
        $('#network_prefer_vendors_table').DataTable().search($(this).val()).draw();
        default_active_nav('.ln-4');
    });
    $('#company_bench_datatable').dataTable();
    $('#company_bench_datatable-search').keyup(function () {
        $('#company_bench_datatable').DataTable().search($(this).val()).draw();
    });
    $('#job_sent_inv_dataTable').dataTable();
    $('#job_sent_inv_dataTable-search').keyup(function () {
        $('#job_sent_inv_dataTable').DataTable().search($(this).val()).draw();
    });
    $('#job_receive_inv_dataTable').dataTable();
    $('#job_receive_inv_dataTable-search').keyup(function () {
        $('#job_receive_inv_dataTable').DataTable().search($(this).val()).draw();
    });
    $('#company_sell_contract-datatable').dataTable();
    $('#company_sell_contract-datatable-search').keyup(function () {
        $('#company_sell_contract-datatable').DataTable().search($(this).val()).draw();
    });
    $('#company-buy-contracts-datatable').dataTable();
    $('#company-buy-contracts-datatable-search').keyup(function () {
        $('#company-buy-contracts-datatable').DataTable().search($(this).val()).draw();
    });
    $('#candidate_job_invite_datatable_1').dataTable();
    $('#candidate_job_invite_datatable-search_1').keyup(function () {
        $('#candidate_job_invite_datatable_1').DataTable().search($(this).val()).draw();
    });
    $('#candidate_job_invite_datatable_2').dataTable();
    $('#candidate_job_invite_datatable-search_2').keyup(function () {
        $('#candidate_job_invite_datatable_2').DataTable().search($(this).val()).draw();
    });
    $('#candidate_job_invite_datatable_3').dataTable();
    $('#candidate_job_invite_datatable-search_3').keyup(function () {
        $('#candidate_job_invite_datatable_3').DataTable().search($(this).val()).draw();
    });
    $('#candidate_job_invite_datatable_4').dataTable();
    $('#candidate_job_invite_datatable-search_4').keyup(function () {
        $('#candidate_job_invite_datatable_4').DataTable().search($(this).val()).draw();
    });
    $('#Req_by_candi_to_bench').dataTable();
    $('#Req_by_candi_to_bench_search').keyup(function () {
        $('#Req_by_candi_to_bench').DataTable().search($(this).val()).draw();
    });
    $('#company-legal-doc').dataTable();
    $('#company-legal-doc-search').keyup(function () {
        $('#company-legal-doc').DataTable().search($(this).val()).draw();
    });

    $('#client-expense-invoice-datatable').dataTable();
    $('#client-expense-invoice-datatable-search').keyup(function () {
        $('#client-expense-invoice-datatable').DataTable().search($(this).val()).draw();
    });

    $('#account-detail-datatable').dataTable();
    $('#account-detail-datatable-search').keyup(function () {
        $('#account-detail-datatable').DataTable().search($(this).val()).draw();
    });

    $('#company_department_dataTable').dataTable();
    $('#company_department_dataTable_search').keyup(function () {
        $('#company_department_dataTable').DataTable().search($(this).val()).draw();
    });
    $('#company_role').dataTable();
    $('#company_role_search').keyup(function () {
        $('#company_role').DataTable().search($(this).val()).draw();
    });

    $('#company_admin').dataTable();
    $('#company_admin_search').keyup(function () {
        $('#company_admin').DataTable().search($(this).val()).draw();
    });

    $('#company_attachments').dataTable({mark: true});
    $('#company_attachments_search').keyup(function () {
        $('#company_attachments').DataTable().search($(this).val()).draw();
    });

    $('#candidate_job_applications_datatable_1').dataTable();
    $('#candidate_job_applications_datatable-search_1').keyup(function () {
        $('#candidate_job_applications_datatable_1').DataTable().search($(this).val()).draw();
    });
    $('#candidate_job_applications_datatable_2').dataTable();
    $('#candidate_job_applications_datatable-search_2').keyup(function () {
        $('#candidate_job_applications_datatable_2').DataTable().search($(this).val()).draw();
    });
    $('#candidate_job_applications_datatable_3').dataTable();
    $('#candidate_job_applications_datatable-search_3').keyup(function () {
        $('#candidate_job_applications_datatable_3').DataTable().search($(this).val()).draw();
    });
    $('#candidate_job_applications_datatable_4').dataTable();
    $('#candidate_job_applications_datatable-search_4').keyup(function () {
        $('#candidate_job_applications_datatable_4').DataTable().search($(this).val()).draw();
    });
    $('#candidate_job_applications_datatable_5').dataTable();
    $('#candidate_job_applications_datatable-search_5').keyup(function () {
        $('#candidate_job_applications_datatable_5').DataTable().search($(this).val()).draw();
    });
    $('#candidate_job_applications_datatable_6').dataTable();
    $('#candidate_job_applications_datatable-search_6').keyup(function () {
        $('#candidate_job_applications_datatable_6').DataTable().search($(this).val()).draw();
    });
    $('#candidate_contracts_datatable').dataTable();
    $('#candidate_contracts_datatable-search').keyup(function () {
        $('#candidate_contracts_datatable').DataTable().search($(this).val()).draw();
    });
    $('#candidate_documents_datatable').dataTable();
    $('#candidate_documents_datatable-search').keyup(function () {
        $('#candidate_documents_datatable').DataTable().search($(this).val()).draw();
    });

    $('#candidate_onboard_legal_doc_datatable').dataTable();
    $('#candidate_onboard_legal_doc_datatable_search').keyup(function () {
        $('#candidate_onboard_legal_doc_datatable').DataTable().search($(this).val()).draw();
    });
    $('#show-sell-contract-datatable').dataTable();
    $('#show-sell-contract-datatable-search').keyup(function () {
        $('#show-sell-contract-datatable').DataTable().search($(this).val()).draw();
    });
    $('#candidate_companies_datatable').dataTable();
    $('#candidate_companies_datatable-search').keyup(function () {
        $('#candidate_companies_datatable').DataTable().search($(this).val()).draw();
    });

    $('#candidate_groups_datatable').dataTable();
    $('#candidate_groups_datatable-search').keyup(function () {
        $('#candidate_groups_datatable').DataTable().search($(this).val()).draw();
    });

    $('#candidate_contacts_datatable').dataTable();
    $('#candidate_contacts_datatable-search').keyup(function () {
        $('#candidate_contacts_datatable').DataTable().search($(this).val()).draw();
    });

    $('#candidate_expenses_datatable').dataTable();
    $('#candidate_expenses_datatable-search').keyup(function () {
        $('#candidate_expenses_datatable').DataTable().search($(this).val()).draw();
    });

    $('#candidate_salaries_datatable').dataTable();
    $('#candidate_salaries_datatable-search').keyup(function () {
        $('#candidate_salaries_datatable').DataTable().search($(this).val()).draw();
    });

    $('#consultants_datatable').dataTable();
    $('#consultants_datatable-search').keyup(function () {
        $('#consultants_datatable').DataTable().search($(this).val()).draw();
    });

    $('#candidate_documents_datatable').dataTable();
    $('#candidate_documents_datatable-search').keyup(function () {
        $('#candidate_documents_datatable').DataTable().search($(this).val()).draw();
    });

    $('#payroll-datatable').dataTable();
    $('#payroll-datatable-search').keyup(function () {
        $('#payroll-datatable').DataTable().search($(this).val()).draw();
    });

    $('#group-datatable-search').keyup(function(){
        $('#group-datatable').DataTable().search( $(this).val() ).draw();
        default_active_nav('.ln-3');

    });

    $('#company-directory-datatable-search').keyup(function(){
        $('#company-directory-datatable').DataTable().search( $(this).val() ).draw();
        default_active_nav('.ln-3');

    });
    $('#companies-datatable-search').keyup(function(){
        $('#companies-datatable').DataTable().search( $(this).val() ).draw();
        default_active_nav('.ln-3');

    });
    $('#company-contacts-datatable-search').keyup(function(){
        $('#company-contacts-datatable').DataTable().search( $(this).val() ).draw();
        default_active_nav('.ln-3');

    });
    $('#company-candidates-datatable-search').keyup(function(){
        $('#company-candidates-datatable').DataTable().search( $(this).val() ).draw();
    });
    $('#my_bench_datatable-search').keyup(function(){
        $('#my_bench_datatable').DataTable().search( $(this).val() ).draw();
    });
    $('#jobs_datatable-search').keyup(function(){
        $('#jobs_datatable').DataTable().search( $(this).val() ).draw();
    });


    $('#payroll-cycles-datatable').dataTable();
    $('#payroll-cycles-datatable-search').keyup(function () {
        $('#payroll-cycles-datatable').DataTable().search($(this).val()).draw();
    });

    $('#holidays-datatable').editableTableWidget({ editor: $('<input>'), preventColumns: [ 4 ]})
        .on('change', function(evt, newValue) {
            var row = evt.target.parentElement;
            var id =  row.getAttribute("data-id");
            var date = row.children[1].textContent;
            var name = row.children[2].textContent;
            var success = true;

            $.ajax({
                url: `/holidays/${id}`,
                data: {holiday: {name: name, date: date}},
                method: "PUT",
                async: false,
                dataType: 'json'
            }).success(function (e) {
                flash_success('Updated Successfully');
                $(`#holidays-datatable tr[data-id='${e.id}'] td`)[0].innerText = moment(e.date).year();
            }).error(function (e) {
                flash_error(e.responseJSON.errors.toString());
                success = false
            });
            return success
        });



    $('#dataTable').dataTable({
        columnDefs: [{
            'targets': 0,
            searchable: false,
            orderable: false
        }]
    });

    $('#company-candidates-datatable').dataTable({
        "drawCallback": function (settings) {
            addeventatc.refresh();
        },
        processing: true,
        serverSide: true,
        order: [[1, "desc"]],
        columnDefs: [{
            'targets': 0,
            searchable: false,
            orderable: false,
            'render': function (data, type, full, meta) {
                return '<input type="checkbox" name="id[]" value="' + full.id + '">';
            }
        },
            {
                'targets': [1, 2],
                searchable: true,
                orderable: true,
                'createdCell': function (td, cellData, rowData, row, col) {
                    $(td).addClass('text-left no-wrap');
                }
            }
        ],
        ajax: $('#company-candidates-datatable').data('source'),
        columns: [
            {
                data: "id"
            },
            {data: "name"},
            {
                data: "recruiter",
                searchable: false,
                orderable: false
            },
            {
                data: "reminder_note",
                searchable: false,
                orderable: false
            },
            {
                data: "status",
                searchable: false,
                orderable: false
            },
            {
                data: "contact",
                searchable: false,
                orderable: false
            },
            {
                data: 'actions',
                searchable: false,
                orderable: false
            }
        ]

    });
    $('#companies-datatable').dataTable({
        "drawCallback": function (settings) {
            addeventatc.refresh();
        },
        processing: true,
        serverSide: true,
        order: [[1, "desc"]],
        columnDefs: [{
            'targets': 0,
            searchable: false,
            orderable: false,
            'render': function (data, type, full, meta) {
                return '<input type="checkbox" name="id[]" value="' + full.id + '">';
            }
        },
        ],
        ajax: $('#companies-datatable').data('source'),
        columns: [
            {
                data: "id"
            },
            {data: "name"},
            {
                data: "users",
                searchable: false,
                orderable: false
            },
            {
                data: "reminder_note",
                searchable: false,
                orderable: false
            },
            {
                data: "status",
                searchable: false,
                orderable: false
            },
            {
                data: "contact",
                searchable: false,
                orderable: false
            },
            {
                data: "actions",
                searchable: false,
                orderable: false
            }
        ]

    });
    $('#company-directory-datatable').dataTable({
        "drawCallback": function (settings) {
            addeventatc.refresh();
        },
        processing: true,
        serverSide: true,
        order: [[1, "desc"]],
        columnDefs: [{
            'targets': 0,
            searchable: false,
            orderable: false,
            'render': function (data, type, full, meta) {
                return '<input type="checkbox" name="id[]" value="' + full.id + '">';
            }
        },
            {
                'targets': 2,
                searchable: true,
                orderable: true,
                'createdCell': function (td, cellData, rowData, row, col) {
                    $(td).addClass('text-left no-wrap');
                }
            }
        ],
        ajax: $('#company-directory-datatable').data('source'),
        columns: [
            {
                data: "id"
            },
            {data: "domain"},
            {data: "name"},
            {data: "title"},
            {
                data: "roles_permissions",
                searchable: false,
                orderable: false
            },
            {
                data: "reminder_note",
                searchable: false,
                orderable: false
            },
            {
                data: "contact",
                searchable: false,
                orderable: false
            },
            {
                data: "actions",
                searchable: false,
                orderable: false
            }
        ]
    });
    $('#group-datatable').dataTable({
        processing: true,
        serverSide: true,
        order: [[1, "desc"]],
        columnDefs: [{
            'targets': 0,
            searchable: false,
            orderable: false,
            'render': function (data, type, full, meta) {
                return '<input type="checkbox" name="id[]" value="' + full.id + '">';
            }
        }
        ],
        ajax: $('#group-datatable').data('source'),
        columns: [
            {
                data: "id"
            },
            {data: "name"},
            {data: "type"},
            {data: "member", searchable: false, orderable: false},
            {data: "created_at"},

            {
                data: "reminder_note",
                searchable: false,
                orderable: false
            },
            {
                data: "status",
                searchable: false,
                orderable: false
            },
            {
                data: "contact",
                searchable: false,
                orderable: false
            },
            {
                data: "actions",
                searchable: false,
                orderable: false
            }
        ]
    });
    $('#application-datatable').dataTable({
        processing: true,
        serverSide: true,
        order: [[0, "desc"]],
        columnDefs: [{
            'targets': 0, searchable: false, orderable: false,
            'render': function (data, type, full, meta) {
                return '<input type="checkbox" name="id[]" value="' + full.id + '">';
            }
        },
            {
                'targets': 1,
                searchable: true,
                orderable: true,
                'createdCell': function (td, cellData, rowData, row, col) {
                    $(td).addClass('text-left');
                }
            }
        ],
        ajax: $('#application-datatable').data('source'),
        columns: [
            {data: "id", searchable: false, orderable: false},
            {data: "name", searchable: false, orderable: false},
            {data: "application_number"},
            {data: "title"},
            {data: "status"},
            {data: "type"},
            {data: "actions", searchable: false, orderable: false},
        ]
    });
    $('#my_bench_datatable').DataTable({
        columnDefs: [{'targets': 0, searchable: false, orderable: false,}],
    });
});
