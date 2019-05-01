class CompanyApplicantDatatable < ApplicationDatatable

  def view_columns
    @view_columns ||= {
        id: {source: "CandidatesCompany.id"},
        name: {source: "Applicantable.first_name"},
        applicantable_type: {source: "CandidatesCompany.applicantable_type"}
    }
  end

  def data
    records.map do |record|
      {
          id: record.id,
          name: "candidate_profile(record)",
          applicantable_type: record.applicantable_type,
      }
    end
  end


  def candidate_profile record
    image_tag(record.applicantable.photo, class: 'data-table-image mr-1').html_safe +
        link_to(do_ellipsis(record.applicantable.full_name), '#', class: 'data-table-font')
  end

  def get_raw_records
    current_company.candidates_companies
  end

end