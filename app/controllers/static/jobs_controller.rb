# frozen_string_literal: true

class Static::JobsController < ApplicationController
  before_action :set_jobs, only: %i[index show]
  before_action :find_job, only: %i[show apply job_appication_without_registeration job_appication_with_recruiter iframe_apply]

  layout 'static'

  add_breadcrumb 'Home', '/'
  add_breadcrumb 'Jobs', :static_jobs_path

  def index
    session[:previous_url] = request.url
    add_breadcrumb params[:category].titleize, static_jobs_path if params[:category].present?

    @current_company = current_company

    if @current_company.present?
      @candidates_hot = CandidatesCompany.hot_candidate.where(company_id: @current_company.id).first(3)
      @jobs_hot = @current_company.jobs.active.is_public.where(listing_type: 'Job').order(created_at: :desc).first(3)
    end

    render layout: 'kulkakit'
  end

  def get_attr_value(data_array, look)
    found_attr_value = nil
    data_array.each_with_index do |data, index|
      next unless /#{look}\s*:/i.match?(data)

      found_attr_value = look == 'description' ?
                             data.gsub(/#{look}\s*:/i, '') + (index == data_array.length - 1 ? ' ' : data_array.slice(index, data_array.length).join("\n")) :
                             data.gsub(/#{look}\s*:/i, '').strip
      break
    end
    found_attr_value
  end

  def people
    ids = params[:ids]
    candidate_ids = ids.split(',').map(&:to_i) if ids.present?

    @current_company = current_company

    if request.subdomain == 'app'
      if candidate_ids.present?
        @candidates = CandidatesCompany.hot_candidate.where(candidate_id: candidate_ids).paginate(page: params[:page], per_page: 50)
      else
        @candidates = CandidatesCompany.hot_candidate.paginate(page: params[:page], per_page: 50)
      end
    elsif @current_company.present?
      @candidates_hot = CandidatesCompany.hot_candidate.where(company_id: @current_company.id).first(3)
      @jobs_hot = @current_company.jobs.active.is_public.where(listing_type: 'Job').order(created_at: :desc).first(3)

      if candidate_ids.present?
        @candidates = CandidatesCompany.hot_candidate.where(company_id: @current_company.id, candidate_id: candidate_ids).paginate(page: params[:page], per_page: 50)
      else
        @candidates = CandidatesCompany.hot_candidate.where(company_id: @current_company.id).paginate(page: params[:page], per_page: 50)
      end
    end

    flash.now[:alert] = 'Please login with Company ID' if params[:is_chat_candidate].present? && params[:is_chat_candidate] == 'true'

    render layout: 'kulkakit'
  end

  def static_feeds
    @current_company = current_company

    if @current_company.present?
      @search = @current_company.jobs.not_system_generated.includes(:created_by).order(created_at: :desc).search(params[:q])
      @company_jobs = @search.result.order(created_at: :desc)

      if params.has_key?(:selected_categories).present?
        @company_jobs = @company_jobs.where(listing_type: params[:selected_categories].to_s.split(',')).paginate(page: params[:page], per_page: 20)
      else
        @company_jobs = @company_jobs.where.not(listing_type: 'Job').paginate(page: params[:page], per_page: 20)
      end
      @candidates_hot = CandidatesCompany.hot_candidate.where(company_id: @current_company.id).first(3)
      @jobs_hot = @current_company.jobs.active.is_public.where(listing_type: 'Job').order(created_at: :desc).first(3)
    end
    render layout: 'kulkakit'
  end

  def iframe_apply
    @job_application = @job.job_applications.new
    # respond_to do |format|
    #   format.html {render layout: "static_headers_less"}
    # end
    response.headers.delete 'X-Frame-Options'
  end

  def job_attr_obj
    {
      status: 'Draft',
      title: request.POST[:subject],
      source: nil,
      description: nil,
      location: nil,
      start_date: DateTime.now,
      end_date: DateTime.now.end_of_year,
      tag_list: nil,
      education_list: nil,
      price: nil,
      job_category: 'Desktop Software Development,Ecommerce Development',
      industry: 'Construction & Labour',
      department: 'Logistics/Supply chain',
      job_type: 'Full Time',
      listing_type: 'Job'
    }
  end

  def job_attr_extractor
    job_attributes = job_attr_obj
    data_array = request.POST['stripped-text'].split(/\n/)
    job_attributes[:source] = get_attr_value(data_array, 'source')
    job_attributes[:location] = get_attr_value(data_array, 'location')
    job_attributes[:price] = get_attr_value(data_array, 'pay').to_f
    job_attributes[:education_list] = get_attr_value(data_array, 'education')
    job_attributes[:tag_list] = get_attr_value(data_array, 'skills')
    # debugger
    job_attributes[:description] = request.POST['body-html'].html_safe # get_attr_value(data_array, "description")
    update_status(job_attributes)
  end

  def update_status(job_attributes)
    %w[Draft Published].each do |status|
      next unless /#{status}\s*:/i.match?(job_attributes[:title])

      job_attributes[:title] = job_attributes[:title].gsub(/#{status}\s*:/i, '').strip.capitalize
      job_attributes[:status] = status
      return job_attributes
    end
    job_attributes
  end

  def find_or_create_company(from)
    company = Company.find_or_create_by(domain: from.domain.split('@')[0].split('.').first) do |compny|
      compnyp.name = from.domain.split('@')[0].split('.').first
      compny.website = from.domain
      compny.phone = '123456789'
      compny.email = from.address.to_s
      compny.company_type = 'hiring_manager'
    end
  end

  def job_request
    subject = request.POST[:subject]
    from = Mail::Address.new(request.POST[:from])
    company_email = from.address.to_s
    company_domain = from.domain.split('@')[0]
    company = find_or_create_company(from)
    full_name = from.name.split
    user = User.find_by_email(company_email) || Admin.create(email: company_email, first_name: full_name.first, last_name: full_name.slice(1, full_name.length), company_id: company.id)
    company.update(owner_id: user.id) if company.owner_id.nil?
    if company
      job = company.jobs.build(job_attr_extractor.merge(created_by_id: user.id))
      job.title = 'Draft Job' unless job.title.present?
      job.description = request.POST['stripped-html'] unless job.source && job.price && job.education_list && job.tag_list

      if job.save(validate: false)
        begin
          JobMailer.send_confirmation_receipt(job).deliver_now
        rescue StandardError
        end
        render json: { message: 'Job Created' }, status: :ok
      else
        render json: { errors: job.errors.full_messages }, status: :unprocessable_entity
      end
    end
  end

  def show
    @current_company = current_company

    if @current_company.present?
      @candidates_hot = CandidatesCompany.hot_candidate.where(company_id: @current_company.id).first(3)
      @jobs_hot = @current_company.jobs.active.is_public.where(listing_type: 'Job').order(created_at: :desc).first(3)
    end

    if @job.present?
      add_breadcrumb @job.title, static_job_path
      render layout: 'kulkakit'
    else
      flash[:error] = 'Job not found.'
      redirect_to static_jobs_path
    end
  end

  def apply
    @job_application = @job.job_applications.new
    @job_application.job_applicant_reqs.build
    @job.custom_fields.each do |cf|
      @job_application.custom_fields.new(name: cf.name)
    end
  end

  def job_appication_without_registeration
    @job_application = @job.job_applications.new
    @job_application.job_applicant_reqs.build
    @job.custom_fields.each do |cf|
      @job_application.custom_fields.new(name: cf.name)
    end
  end

  def job_appication_with_recruiter
    @job_application = @job.job_applications.new
    @job_application.job_applicant_reqs.build
    @job.custom_fields.each do |cf|
      @job_application.custom_fields.new(name: cf.name)
    end
  end

  def import_job
    p '3333333333333333333333333333333333'
    p '3333333333333333333333333333333333'
    p '3333333333333333333333333333333333'
  end

  def filter_jobs
    @current_company = current_company
    if request.subdomain == "app"
      if params[:selected_categories].present?
        @job_all = Job.active.is_public.where(listing_type: 'Job').where(job_category: params[:selected_categories]).order(created_at: :desc).paginate(page: params[:page], per_page: 50) || []
      else
        @job_all = Job.active.is_public.where(listing_type: 'Job').order(created_at: :desc).paginate(page: params[:page], per_page: 50) || []
      end
    else
      if params[:selected_categories].present?
        @job_all = @current_company.jobs.active.is_public.where(listing_type: 'Job').where(job_category: params[:selected_categories]).order(created_at: :desc).paginate(page: params[:page], per_page: 50) || []
      else
        @job_all = @current_company.jobs.active.is_public.where(listing_type: 'Job').order(created_at: :desc).paginate(page: params[:page], per_page: 50) || []
      end
    end
  end

  private

  def set_jobs
    @current_company = current_company

    if request.subdomain == 'app'
      @search = params[:category].present? ? Job.active.is_public.where('job_category =?', params[:category]).ransack(params[:q]) : Job.active.is_public.ransack(params[:q])
      jobs = @search.result(distinct: true).where(listing_type: 'Job').order(created_at: :desc).paginate(page: params[:page], per_page: 50)
      # @search_q = Job.is_public.active.ransack(params[:q])
      # @jobs_groups = @search_q.result.group_by(&:job_category)
      if jobs.present?
        @job_all = jobs
      else
        @job_all = Job.active.is_public.where(listing_type: 'Job').order(created_at: :desc).paginate(page: params[:page], per_page: 50) || []
      end
      @job_categories = Job.active.is_public.pluck(:job_category).uniq
    elsif @current_company.present?
      @search = params[:category].present? ? @current_company.jobs.active.is_public.where('job_category =?', params[:category]).ransack(params[:q]) : @current_company.jobs.active.is_public.ransack(params[:q])
      jobs = @search.result(distinct: true).where(listing_type: 'Job').order(created_at: :desc).paginate(page: params[:page], per_page: 50)
      if jobs.present?
        @job_all = jobs
      else
        @job_all = @current_company.jobs.active.is_public.where(listing_type: 'Job').order(created_at: :desc).paginate(page: params[:page], per_page: 50) || []
      end
      @job_categories = @current_company.jobs.active.is_public.pluck(:job_category).uniq
    else
      @search = Job.active.is_public.where(listing_type: 'Job').ransack(params[:q])
      @job_all = []
      @job_categories = []
    end
  end

  def find_job
    @job = Job.is_public.where(id: params[:id] || params[:job_id]).first
  end

  def custom_domain?
    request_domain_with_port = "#{request.domain}#{request.port_string}"
    request_domain_with_port != ENV['domain']
  end

  def current_company
    if custom_domain?
      Company.find_by(custom_domain: request.domain)
    else
      Company.find_by(slug: request.subdomain)
    end
  end
end
