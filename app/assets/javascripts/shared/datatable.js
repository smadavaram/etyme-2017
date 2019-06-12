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
          $(td).addClass('text-left');
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
  $('#company-candidates-datatable').dataTable({
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
        'targets': [1,2],
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
          $(td).addClass('text-left');
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
      {data: "id",searchable: false, orderable: false},
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
