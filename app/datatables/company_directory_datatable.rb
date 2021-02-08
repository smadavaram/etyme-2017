# frozen_string_literal: true

class CompanyDirectoryDatatable < ApplicationDatatable
  def_delegator :@view, :profile_company_path
  def_delegator :@view, :company_user_profile_path
  def_delegator :@view, :add_reminder_company_users_path
  def_delegator :@view, :admin_path

  def view_columns
    @view_columns ||= {
      id: { source: 'User.id' },
      domain: { source: 'Company.website' },
      name: { source: 'User.first_name' },
      title: { source: 'User.type' }
    }
  end

  def data
    records.map do |record|
      {
        id: record.id,
        domain: record.company&.website,
        name: company_user_profile(record),
        title: record.type,
        roles_permissions: 'TBD',
        reminder_note: reminder_note(record),
        contact: contact_icon(record),
        actions: actions(record)
      }
    end
  end

  def get_raw_records
    # current_company.users.includes(%i[reminders statuses]).joins(:company)
    current_company.directory.includes(%i[reminders statuses]).joins(:company)
    # current_company.company_contacts_users.includes(%i[reminders statuses]).joins(:company)
    # current_company.company_contacts.includes(%i[reminders statuses]).joins(:company)
  end

  def company_user_profile(user)
    (link_to user_image(user, style: 'width: 35px; height: 35px;', class: 'data-table-image mr-2', title: user.full_name&.to_s), company_user_profile_path(user)) +
      link_to(do_ellipsis(user.first_name), company_user_profile_path(user), class: 'pl-2')
  end

  def reminder_note(record)
    content_tag(:span, do_ellipsis(current_user.reminders&.where(reminderable_id: record.id, reminderable_type: 'Admin')&.last&.title), class: 'bg-info badge mr-1')&.html_safe
  end

  def contact_icon(record)
    contact_widget(record.email, record.phone, record, chat_link: chat_link(record))
  end

  def delete_link_for_owner(record)
    link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, admin_path(record), method: :delete, title: "Delete #{record.full_name}", class: 'data-table-icons') if (current_company.owner&.id == current_user.id) && (record.id != current_user.id)
  end

  def actions(record)
    link_to(content_tag(:i, nil, class: 'picons-thin-icon-thin-0014_notebook_paper_todo').html_safe, add_reminder_company_users_path(user_id: record.id), remote: :true, title: 'Remind Me', class: 'data-table-icons') +
      # link_to(content_tag(:i, nil, class: 'fa fa-edit').html_safe, '#', title: "Edit #{record.full_name}", class: 'data-table-icons') +
      delete_link_for_owner(record)
  end
end
