class CompanyContactDatatable < ApplicationDatatable
  def_delegator :@view, :company_statuses_path
  def_delegator :@view, :company_assign_status_path
  def_delegator :@view, :company_company_add_reminder_path
  def_delegator :@view, :company_contacts_company_companies_path
  def_delegator :@view, :company_company_assign_groups_to_contact_path

  def view_columns
    @view_columns ||= {
        logo: {source: "Company.name"},
        first_name: {source: "CompanyContact.first_name"},
        last_name: {source: "CompanyContact.last_name"},
        title: {source: "CompanyContact.title"},
        email: {source: "CompanyContact.email"}
    }
  end


  def data
    records.map do |record|
      {
          logo: record.try(:user_company).try(:name),
          first_name: record.first_name,
          last_name: record.last_name,
          title: record.title,
          email: record.email,
          groups: groups(record),
          reminder_note: reminder_note(record),
          actions: actions(record)
      }
    end
  end

  def get_raw_records
    current_company.company_contacts.includes(company: [:reminders,:statuses])
  end

  def reminder_note record
    content_tag(:span,record.user_company&.reminders&.last&.title, class: 'label-info badge mr-1').html_safe +
    content_tag(:span,record.user_company&.statuses&.last&.status_type, class: 'label-info badge').html_safe
  end


  def groups record
    record.groups.map{|group| content_tag(:span, group.group_name, class: 'badge bg-color-blue margin-bottom-5').html_safe }.join('').html_safe
  end

  def actions record
    link_to(content_tag(:i, nil, class: 'fa fa-sticky-note ').html_safe, company_statuses_path(id: record.user_company, type: 'Company'), title: 'Status Log', class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-sticky-note ').html_safe, company_assign_status_path(record.user_company), remote: :true, title: "Assign Status", class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-phone ').html_safe, '#', title: record.phone, class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-user-plus ').html_safe, '#', title: 'Follow/Unfollow', class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-bell ').html_safe, company_company_add_reminder_path(record.user_company), remote: :true, title: "Remind Me", class: 'data-table-icons') +
        link_to(content_tag(:i, nil, class: 'fa fa-users').html_safe, company_company_assign_groups_to_contact_path(record), remote: true, title: 'Add to Group', class: 'data-table-icons')
  end


end
