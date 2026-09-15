# frozen_string_literal: true

class GroupDatatable < ApplicationDatatable
  def_delegator :@view, :group_path
  def_delegator :@view, :add_reminder_group_path
  def_delegator :@view, :ban_company_black_listers_path
  def_delegator :@view, :unban_company_black_listers_path

  def view_columns
    
    @view_columns ||= {
      id: { source: 'Group.id' },
      name: { source: 'Group.group_name' },
      type: { source: 'Group.member_type' },
      member: { source: 'Group.member_type' },
    reminder_note: { source: 'Group.reminder_note' , searchable: false, orderable: false},
      created_at: { source: 'Group.created_at' , searchable: false, orderable: false},
      status: { source: 'Group.status' , searchable: false, orderable: false},
      contact: { source: 'Group.contact' , searchable: false, orderable: false},
      actions: { source: 'Group.actions' , searchable: false, orderable: false},
    }
  end

  def data
    records.map do |record|
      {
        id: record.id,
        name: do_ellipsis(record.group_name),
        type: record.member_type,
        member: record.groupables.count,
        created_at: colorfull_text(record.created_at.try(:strftime, '%d of %B, %Y'), '#1AAE9F'),
        reminder_note: reminder_note(record),
        status: ban_unban_link(record),
        contact: contact_widget(record.group_emails, nil, nil, chat_link: chat_link(nil, record.conversation.id)),
        actions: actions(record)
      }
    end
  end

  def reminder_note(record)
    #content_tag(:span, do_ellipsis(record&.reminders.where(user_id: current_user.id)&.last&.title), class: 'bg-info badge mr-1').html_safe
    reminder  = record.reminders.where(user_id: current_user.id).last
    html      = ''
    html      += reminder.title unless reminder.blank?
    html.html_safe
  end

  def ban_unban_link(record)
    record.get_blacklist_status(current_company.id) == 'banned' ?
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, group_path(record), method: :delete, data: { confirm: 'Are you sure?' }, class: 'data-table-icons') +
          link_to(content_tag(:i, nil, class: 'os-icon os-icon-unlock').html_safe, unban_company_black_listers_path(record.id, 'Group'), method: :post, title: 'UnBlock Group', class: 'data-table-icons')
        :
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, group_path(record), method: :delete, data: { confirm: 'Are you sure?' }, class: 'data-table-icons') +
          link_to(content_tag(:i, nil, class: 'os-icon os-icon-lock').html_safe, ban_company_black_listers_path(record.id, 'Group'), method: :post, title: 'Block Group', class: 'data-table-icons')
  end

  def get_raw_records
    current_company.groups.contact_groups
  end

  def actions(record)
    # link_to(content_tag(:i, nil, class: 'fa fa-comment-o').html_safe, '#', title: 'chat', class: 'data-table-icons') +
    link_to(content_tag(:i, nil, class: 'picons-thin-icon-thin-0014_notebook_paper_todo').html_safe, add_reminder_group_path(record), remote: :true, method: :post, title: 'Remind Me', class: 'data-table-icons')
  end
end
