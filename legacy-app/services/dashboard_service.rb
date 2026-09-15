# frozen_string_literal: true

class DashboardService
  def initialize(current_user, company)
    @current_user = current_user
    @company = company
  end

  def company_dashboard_cards(params)
    start_date = get_start_date(params)
    end_date = get_end_date(params)

    cards = {}
    cards['JOB'] = @company.jobs.where(created_at: start_date...end_date).count
    cards['BENCH JOB'] = @company.jobs.where(status: 'Bench').where(created_at: start_date...end_date).count
    cards['BENCH'] = @company.candidates_companies.hot_candidate.joins(:candidate).where('candidates.created_at': start_date...end_date).count
    cards['APPLICATION'] = @company.received_job_applications.where(created_at: start_date...end_date).count
    cards['STATUS'] = Company.status_count(@company, start_date, end_date)
    cards['ACTIVE'] = params[:filter]

    current_user_cards = {}
    current_user_cards['JOB'] = Job.where(created_by_id: @current_user, created_at: start_date...end_date).count
    current_user_cards['BENCH JOB'] = Job.where(created_by_id: @current_user, status: 'Bench').where(created_at: start_date...end_date).count
    current_user_cards['APPLICATION'] = JobApplication.joins(:job).where('jobs.created_by_id= ?', @current_user)
    current_user_cards['BENCH'] = @current_user.company.candidates_companies.hot_candidate.where('created_at': start_date...end_date).count

    { cards: cards, current_user_cards: current_user_cards }
  end

  def candidate_dashboard_cards(candidate, params)
    start_date = get_start_date(params)
    end_date = get_end_date(params)

    cards = {}
    cards['APPLICATION'] = candidate.job_applications.where(created_at: start_date...end_date).size
    cards['STATUS'] = Candidate.application_status_count(candidate, start_date, end_date)
    cards['ACTIVE'] = params[:filter]
    cards
  end

  def marketplace_cards(params)
    start_date = get_start_date(params)
    end_date = get_end_date(params)

    cards = {}
    cards['JOB'] = @company.jobs.where(created_at: start_date...end_date).count
    cards['BENCH JOB'] = @company.jobs.where(status: 'Bench').where(created_at: start_date...end_date).count
    cards['BENCH'] = @company.candidates.where(company_id: @company.id).where(created_at: start_date...end_date).count
    cards['APPLICATION'] = @company.received_job_applications.where(created_at: start_date...end_date).count
    cards['STATUS'] = Company.status_count(@company, start_date, end_date)
    cards['ACTIVE'] = params[:filter]
    cards
  end

  def import_users(emails)
    CompanyContact.transaction do
      emails.split(',').each do |email|
        email = email.downcase
        next unless (email =~ /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i).present?

        password = SecureRandom.hex(10)
        user = @company.admins.where(email: email).first_or_initialize(password: password, password_confirmation: password)
        user.save! unless user.persisted?
      end
    end
    { success: true, message: 'All the email are processed successfully' }
  rescue ActiveRecord::RecordInvalid
    { success: false, errors: ["Please check the users' email formats and try again"] }
  end

  def add_contacts(emails)
    CompanyContact.transaction do
      emails.split(',').each do |email|
        email = email.downcase
        next unless (email =~ /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i).present?

        user = DiscoverUser.new.discover_user(email)
        contact = @company.company_contacts.where(user: user).first_or_initialize(created_by: @current_user, user_company: user.company, email: user.email)
        contact.save! unless contact.persisted?
      end
    end
    { success: true, message: 'All the email are processed successfully' }
  rescue ActiveRecord::RecordInvalid
    { success: false, errors: ["Please check the contacts' email formats and try again"] }
  end

  def change_owner(email, owner_params)
    domain = @company.domain
    email_domain = Mail::Address.new(email.downcase).domain.split('.').first

    unless domain == email_domain
      return { success: false, errors: ['Owner must be with company domain'] }
    end

    password = SecureRandom.hex(10)
    owner = @company.admins.where(email: email.downcase).first_or_initialize(owner_params.merge(password: password, password_confirmation: password))

    if owner.save
      @company.update(owner_id: owner.id)
      { success: true, message: 'Owner/Administrator has been changed' }
    else
      { success: false, errors: owner.errors.full_messages }
    end
  end

  def get_start_date(params)
    filter = params[:filter] || 'year'
    case filter
    when 'period'
      DateTime.parse(params[:start_date]).beginning_of_day
    when 'month'
      DateTime.current.beginning_of_month
    when 'quarter'
      DateTime.current.beginning_of_quarter
    when 'year'
      DateTime.current.beginning_of_year
    end
  end

  def get_end_date(params)
    filter = params[:filter] || 'year'
    case filter
    when 'period'
      DateTime.parse(params[:end_date]).end_of_day
    when 'month'
      DateTime.current.end_of_month
    when 'quarter'
      DateTime.current.end_of_quarter
    when 'year'
      DateTime.current.end_of_year
    end
  end
end
