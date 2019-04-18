class CompanyContactDatatable < ApplicationDatatable
  def_delegator :@view, :company_contacts_company_companies_path

  def view_columns
    @view_columns ||= {
      logo: { source: "Company.name"},
      first_name: { source: "CompanyContact.first_name" },
      last_name: { source: "CompanyContact.last_name" },
      title: {source: "CompanyContact.title"},
      email: {source: "CompanyContact.email"},
      phone: {source: "CompanyContact.phone"},
    }
  end


  def data
    records.map do |record|
      {
        logo: company_logo_and_name( record.company) ,
        first_name: record.first_name,
        last_name: record.last_name,
        title: record.title,
        email: record.email,
        phone: record.phone,
        actions: actions(record)
      }
    end
  end

  def get_raw_records
    current_company.company_contacts.joins(:company)
  end


  def actions record
     link_to(content_tag(:i, nil, class: 'fa fa-comment ').html_safe, company_contacts_company_companies_path(record), title: 'Comment here', class: 'data-table-icons')+
     link_to(content_tag(:i, nil, class: 'fa fa-edit').html_safe, company_contacts_company_companies_path(record), title: 'Edit Contact', class: 'data-table-icons')+
     link_to(content_tag(:i, nil, class: 'fa fa-times').html_safe, company_contacts_company_companies_path(record), title: 'Delete Contact', class: 'data-table-icons')+
     link_to(content_tag(:i, nil, class: 'fa fa-users').html_safe, company_contacts_company_companies_path(record), title: 'Add to Group', class: 'data-table-icons')
  end


end
