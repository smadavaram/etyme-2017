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
                data: "contact",
                searchable: false,
                orderable: false
            },
            {
                data: "status",
                searchable: false,
                orderable: false
            },
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
    });
    $('#receive_prefer_vendors_table').dataTable();
    $('#receive_prefer_vendors_table-search').keyup(function () {
        $('#receive_prefer_vendors_table').DataTable().search($(this).val()).draw();
    });
    $('#network_prefer_vendors_table').dataTable();
    $('#network_prefer_vendors_table-search').keyup(function () {
        $('#network_prefer_vendors_table').DataTable().search($(this).val()).draw();
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
            {data: "company"},
            {data: "name"},
            {
                data: "recruiter",
                searchable: false,
                orderable: false
            },
            {
                data: "contact",
                searchable: false,
                orderable: false
            },
            {
                data: "status",
                searchable: false,
                orderable: false
            },
            {
                data: "reminder_note",
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
                data: "contact",
                searchable: false,
                orderable: false
            },
            {
                data: "status",
                searchable: false,
                orderable: false
            },
            {
                data: "reminder_note",
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
            {
                data: "contact",
                searchable: false,
                orderable: false
            },
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
                data: "status",
                searchable: false,
                orderable: false
            },
            {
                data: "reminder_note",
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
