# frozen_string_literal: true

class PublicJobService
  def initialize(company = nil)
    @company = company
  end

  def find_or_create_company_from_email(from_address)
    from = Mail::Address.new(from_address)
    Company.find_or_create_by(domain: from.domain.split('@')[0].split('.').first) do |compny|
      compny.name = from.domain.split('@')[0].split('.').first
      compny.website = from.domain
      compny.phone = '123456789'
      compny.email = from.address.to_s
      compny.company_type = 'hiring_manager'
    end
  end

  def process_job_request(post_params, job_attributes)
    from = Mail::Address.new(post_params[:from])
    company_email = from.address.to_s
    company = find_or_create_company_from_email(post_params[:from])
    full_name = from.name.split
    user = User.find_by_email(company_email) || Admin.create(
      email: company_email,
      first_name: full_name.first,
      last_name: full_name.slice(1, full_name.length),
      company_id: company.id
    )
    company.update(owner_id: user.id) if company.owner_id.nil?

    if company
      job = company.jobs.build(job_attributes.merge(created_by_id: user.id))
      job.title = 'Draft Job' unless job.title.present?
      job.description = post_params['stripped-html'] unless job.source && job.price && job.education_list && job.tag_list

      if job.save(validate: false)
        begin
          JobMailer.send_confirmation_receipt(job).deliver_now
        rescue StandardError
        end
        { success: true, message: 'Job Created' }
      else
        { success: false, errors: job.errors.full_messages }
      end
    else
      { success: false, errors: ['Company not found'] }
    end
  end

  def post_job_as_user(user, company, job_params)
    current_company = user.company.present? ? user.company : company
    job = current_company.jobs.new(job_params.merge(created_by_id: user.id, listing_type: 'Job'))
    if job.save
      { success: true, job: job, message: 'The job was successfully created!' }
    else
      { success: false, errors: job.errors.full_messages }
    end
  end

  def post_job_as_candidate(candidate, company, job_params)
    job = company.jobs.new(job_params.merge(created_by_candidate_id: candidate.id, listing_type: 'Job', status: 'Draft'))
    if job.save
      notify_owner_of_new_job(company, job)
      { success: true, job: job, message: 'The job was successfully created! An admin will review it before it shows up in the feed.' }
    else
      { success: false, errors: job.errors.full_messages }
    end
  end

  def filter_static_feeds(params, subdomain)
    if @company.present? || subdomain == 'app'
      if subdomain == 'app'
        company_jobs = Job.all.active.not_system_generated.includes(:created_by)
      else
        company_jobs = @company.jobs.active.not_system_generated.includes(:created_by)
      end

      company_jobs = company_jobs.search_with(params[:input_search]) if params[:input_search]
      company_jobs = apply_sort(company_jobs, params[:sort])
      company_jobs = apply_category_filter(company_jobs, params)
      company_jobs
    else
      []
    end
  end

  def people_list(params, subdomain)
    candidate_ids = params[:ids].present? ? params[:ids].split(',').map(&:to_i) : nil
    uniq_candidates_company = CandidatesCompany.where(id: CandidatesCompany.hot_candidate.uniq(&:candidate_id))

    if subdomain == 'app'
      if candidate_ids.present?
        CandidatesCompany.hot_candidate.where(candidate_id: candidate_ids.uniq).paginate(page: params[:page], per_page: 50)
      else
        uniq_candidates_company.order(updated_at: :desc).paginate(page: params[:page], per_page: 50)
      end
    elsif @company.present?
      if candidate_ids.present?
        @company.candidates_companies.hot_candidate.where(candidate_id: candidate_ids).group_by(&:candidate_id).map { |a| a[1].first }
      else
        CandidatesCompany.where(company_id: @company.id).hot_candidate.uniq(&:candidate_id)
      end
    end
  end

  private

  def apply_sort(jobs, sort_param)
    case sort_param
    when 'created_asc'
      jobs.order(created_at: :asc)
    when 'created_desc'
      jobs.order(created_at: :desc)
    when 'trending_asc'
      jobs.left_joins(:job_applications).group(:id).order('COUNT(job_applications.id) ASC')
    when 'trending_desc'
      jobs.left_joins(:job_applications).group(:id).order('COUNT(job_applications.id) DESC')
    else
      jobs.order(created_at: :desc)
    end
  end

  def apply_category_filter(jobs, params)
    if params.key?(:selected_categories).present?
      if params.key?(:input_search).present?
        if params[:selected_categories] == 'all'
          jobs.where.not(listing_type: 'Job').where("lower(title) LIKE (?)", "%#{params[:input_search].downcase}%").paginate(page: params[:page], per_page: 20)
        else
          jobs.where(listing_type: params[:selected_categories].to_s.split(',')).where("lower(title) LIKE (?)", "%#{params[:input_search].downcase}%").paginate(page: params[:page], per_page: 20)
        end
      else
        if params[:selected_categories] == 'all'
          jobs.where.not(listing_type: 'Job').paginate(page: params[:page], per_page: 20)
        else
          jobs.where(listing_type: params[:selected_categories].to_s.split(',')).paginate(page: params[:page], per_page: 20)
        end
      end
    else
      jobs.where.not(listing_type: 'Job').paginate(page: params[:page], per_page: 20)
    end
  end

  def notify_owner_of_new_job(company, job)
    recipient = company.owner || company.admins.first
    return unless recipient.present?

    recipient.notifications.create(
      title: "A new job listing created by #{job.created_by_candidate.full_name} needs to be reviewed!",
      message: "#{job.created_by_candidate.full_name} has just created a new job listing! It needs to be reviewed before it can be published to the main feed.",
      notification_type: 'job',
      createable_id: job.created_by_candidate_id,
      createable_type: 'Candidate'
    )
  end
end
