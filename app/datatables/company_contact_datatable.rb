class CompanyContactDatatable < ApplicationDatatable
  def_delegator :@view, :profile_company_path
  def_delegator :@view, :company_statuses_path
  def_delegator :@view, :ban_company_black_listers_path
  def_delegator :@view, :unban_company_black_listers_path
  def_delegator :@view, :company_user_profile_path
  def_delegator :@view, :company_assign_status_path
  def_delegator :@view, :company_company_add_reminder_path
  def_delegator :@view, :company_contacts_company_companies_path
  def_delegator :@view, :company_company_assign_groups_to_contact_path
  def_delegator :@view, :edit_company_path
  def_delegator :@view, :company_company_contact_path

  def view_columns
    @view_columns ||= {
        id: {source: "CompanyContact.id"},
        name: {source: "Company.name"},
        first_name: {source: "User.first_name"},
        title: {source: "CompanyContact.title"},
    }
  end


  def data
    records.map do |record|
      {
          id: record.id,
          name: company_profile(record.try(:user_company)),
          first_name: company_user_profile(record.user),
          title: do_ellipsis(record.title),
          contact: contact_icon(record),
          status: ban_unban_link(record),
          groups: groups(record),
          reminder_note: reminder_note(record),
          actions: actions(record)
      }
    end
  end

  def company_user_profile user
    image_tag(user.photo, class: 'data-table-image mr-1').html_safe +
        link_to(do_ellipsis(user.first_name), company_user_profile_path(user), class: 'data-table-font')
  end

  def company_profile company
    link_to(do_ellipsis(company.name), profile_company_path(company), class: 'data-table-font').html_safe
  end

  def get_raw_records
    current_company.company_contacts.includes(:user_company, company: [:reminders, :statuses]).joins(:user, :user_company)
  end

  def reminder_note record
    content_tag(:span, do_ellipsis(record.user_company&.reminders&.last&.title), class: 'bg-info badge mr-1').html_safe
  end

  def contact_icon record
    contact_widget(record.email, record.phone)
  end

  def groups record
    if record.groups.count > 0
      link_to(record.groups.count, company_company_assign_groups_to_contact_path(record), remote: true, class: 'data-table-icons')
    else
      record.groups.count
    end
  end

  def actions record
    link_to(content_tag(:i, nil, class: 'fa fa-bell-o ').html_safe, company_company_add_reminder_path(record.user_company), remote: :true, title: "Remind Me", class: 'data-table-icons') +
        link_to(image_tag('groups.png', size: '16x16', class: '').html_safe, company_company_assign_groups_to_contact_path(record), remote: true, title: 'Add to Group', class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-edit').html_safe, "#", remote: true, title: "Edit #{record.full_name}", class: 'data-table-icons')
  end

  # company_path(d.invited_company)

  def ban_unban_link(record)
    record.user_company.get_blacklist_status(record.company_id) == 'banned' ?
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, company_company_contact_path(record.id), method: :delete, title: "Delete #{record.full_name}", class: 'data-table-icons') +
            link_to(content_tag(:i, nil, class: 'os-icon os-icon-unlock').html_safe, unban_company_black_listers_path(record.user_company_id, 'Company'), method: :post, title: 'WhiteList Company', class: 'data-table-icons')
        :
        link_to(content_tag(:i, nil, class: 'os-icon os-icon-ui-15').html_safe, company_company_contact_path(record.id), method: :delete, title: "Delete #{record.full_name}", class: 'data-table-icons') +
            link_to(content_tag(:i, nil, class: 'os-icon os-icon-lock').html_safe, ban_company_black_listers_path(record.user_company_id, 'Company'), method: :post, title: 'BlackList Company ', class: 'data-table-icons')
  end

end
