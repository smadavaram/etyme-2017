class CompanyDirectoryDatatable < ApplicationDatatable
  def_delegator :@view, :profile_company_path
  def_delegator :@view, :company_user_profile_path
  def_delegator :@view, :add_reminder_company_users_path
  def_delegator :@view, :admin_path

  def view_columns
    @view_columns ||= {
        id: {source: "User.id"},
        domain: {source: "Company.website"},
        name: {source: "User.first_name"},
        title: {source: "User.title"}
    }
  end


  def data
    records.map do |record|
      {
          id: record.id,
          domain: record.company.website,
          name: company_user_profile(record),
          contact: contact_icon(record),
          title: 'title',
          roles_permissions: 'TBD',
          reminder_note: reminder_note(record),
          actions: actions(record)
      }
    end
  end

  def get_raw_records
    current_company.users.includes([:company, :reminders, :statuses])
  end

  def company_user_profile user
    image_tag(user.photo, class: 'data-table-image mr-1').html_safe +
        link_to(do_ellipsis(user.first_name), company_user_profile_path(user), class: 'data-table-font')
  end


  def reminder_note record
    content_tag(:span, do_ellipsis(current_user.reminders.where(reminderable_id: record.id, reminderable_type: 'Admin')&.last&.title), class: 'bg-info badge mr-1').html_safe
  end

  def contact_icon record
    mail_to(record&.email, content_tag(:i, nil, class: 'os-icon os-icon-email-2-at2').html_safe, title: "#{record.email}", class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-phone ').html_safe, '#', title: "#{record.phone}", class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-calendar').html_safe, '#', title: 'Add meeting', class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-comment-o').html_safe, '#', title: 'Add Comment', class: 'data-table-icons')

  end

  def delete_link_for_owner(record)
    if current_company.owner.id == current_user.id and record.id != current_user.id
      link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, admin_path(record), method: :delete, title: "Delete #{record.full_name}", class: 'data-table-icons')
    end
  end

  def actions record
    link_to(content_tag(:i, nil, class: 'fa fa-bell-o ').html_safe, add_reminder_company_users_path(user_id: record.id), remote: :true, title: "Remind Me", class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-edit').html_safe, '#', title: "Edit #{record.full_name}", class: 'data-table-icons') +
        delete_link_for_owner(record)
  end
end