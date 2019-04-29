class GroupDatatable < ApplicationDatatable
  def_delegator :@view, :group_path
  def_delegator :@view, :ban_company_black_listers_path
  def_delegator :@view, :unban_company_black_listers_path
  def_delegator :@view, :assign_status_group_path
  def_delegator :@view, :add_reminder_group_path

  def view_columns
    @view_columns ||= {
        id: {source: "Group.id"},
        name: {source: "Group.group_name"},
        type: {source: "Group.member_type"},
        created_at: {source: "Group.created_at"},
    }
  end


  def data
    records.map do |record|
      {
          id: record.id,
          name: do_ellipsis(record.group_name),
          type: record.member_type,
          member: record.groupables.count,
          created_at: record.created_at.try(:strftime, '%B %d, %Y'),
          status: ban_unban_link(record),
          reminder_note: reminder_note(record),
          actions: actions(record)
      }
    end
  end

  def reminder_note record
    content_tag(:span, do_ellipsis(record&.reminders&.last&.title), class: 'bg-info badge mr-1').html_safe +
        content_tag(:span, record&.statuses&.last&.status_type, class: 'bg-info badge').html_safe
  end

  def ban_unban_link(record)
    record.get_blacklist_status(current_company.id) == 'banned' ?
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, group_path(record), method: :delete, data: {confirm: 'Are you sure?'}, class: 'data-table-icons') +
            link_to(content_tag(:i, nil, class: 'os-icon os-icon-unlock').html_safe, unban_company_black_listers_path(record.id, 'Group'), method: :post, title: 'UnBlock Group', class: 'data-table-icons')
        :
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, group_path(record), method: :delete, data: {confirm: 'Are you sure?'}, class: 'data-table-icons') +
            link_to(content_tag(:i, nil, class: 'os-icon os-icon-lock').html_safe, ban_company_black_listers_path(record.id, 'Group'), method: :post, title: 'Block Group', class: 'data-table-icons')
  end

  def get_raw_records
    current_company.groups
  end

  def actions record
    link_to(content_tag(:i, nil, class: 'fa fa-comment-o').html_safe, '#', title: 'chat', class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-sticky-note-o ').html_safe, assign_status_group_path(record), remote: :true, method: :post, title: "Assign Status", class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-bell-o ').html_safe, add_reminder_group_path(record), remote: :true,method: :post, title: "Remind Me", class: 'data-table-icons')
  end


end
