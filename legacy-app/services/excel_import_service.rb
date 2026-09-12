# frozen_string_literal: true

class ExcelImportService
  attr_reader :file_path

  def initialize(file_path)
    @file_path = file_path
  end

  def import_jobs
    xlsx = Roo::Spreadsheet.open(file_path, extension: :xlsx)
    row_count = xlsx.info.split('Last row:')[1].split("\n")[0].to_i

    (2..row_count).each do |data|
      row = xlsx.sheet('Sheet1').row(data)

      company = Company.find(row[15]) rescue nil
      next unless company

      job = company.jobs.new(
        title: row[0],
        description: row[11],
        location: row[2],
        start_date: row[6],
        end_date: row[7],
        company_id: row[16].to_i,
        created_by_id: row[15].to_i,
        is_public: row[14],
        job_category: row[3],
        industry: row[4],
        department: row[5],
        price: row[8],
        job_type: row[9],
        listing_type: row[1],
        comp_video: row[10]
      )
      job.save
    end
  end

  def import_candidates
    xlsx = Roo::Spreadsheet.open(file_path, extension: :xlsx)
    row_count = xlsx.info.split('Last row:')[1].split("\n")[0].to_i

    (2..row_count).each do |data|
      row = xlsx.sheet('Sheet1').row(data)

      candidate = Candidate.new(
        email: row[0],
        phone: row[1],
        first_name: row[2],
        last_name: row[3],
        gender: row[4],
        password: row[5],
        password_confirmation: row[6]
      )
      candidate.save
    end
  end

  def import_companies
    xlsx = Roo::Spreadsheet.open(file_path, extension: :xlsx)
    row_count = xlsx.info.split('Last row:')[1].split("\n")[0].to_i

    (2..row_count).each do |data|
      row = xlsx.sheet('Sheet1').row(data)
      next unless row[6].present?

      import_company_row(row)
    end
  end

  def import_contacts
    xlsx = Roo::Spreadsheet.open(file_path, extension: :xlsx)
    row_count = xlsx.info.split('Last row:')[1].split("\n")[0].to_i

    (2..row_count).each do |data|
      row = xlsx.sheet('Sheet1').row(data)
      next unless row[6].present?

      import_company_row(row)
    end
  end

  private

  def import_company_row(row)
    companies = Company.where(domain: row[6])
    if companies.present?
      create_contact_for_company(companies.first, row) unless row[14].blank?
    else
      company = build_company_from_row(row)
      if company.valid? && company.save
        create_contact_for_company(company, row) unless row[14].blank?
      end
    end
  end

  def build_company_from_row(row)
    total_slug = Company.where('slug like ?', "#{row[6].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase}_").count
    company = Company.new(
      name: row[0],
      website: row[1],
      description: row[2],
      phone: row[3],
      company_type: row[4],
      slug: row[5],
      domain: row[6],
      email: row[9]
    )

    base_slug = row[6].split('.')[0].gsub(/[^0-9A-Za-z.]/, '').downcase
    company.slug = total_slug == 0 ? base_slug : "#{base_slug}#{total_slug + 1}"
    company
  end

  def create_contact_for_company(company, row)
    CompanyContact.create(
      company_id: company.id,
      email: row[14],
      first_name: row[10],
      last_name: row[11],
      phone: row[12],
      title: row[13]
    )
  end
end
