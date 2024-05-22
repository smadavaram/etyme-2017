# frozen_string_literal: true

class Static::JobsController < ApplicationController
  include GoogleJobs

  before_action :set_jobs, only: %i[index show]
  before_action :find_job, only: %i[show apply job_appication_without_registeration job_appication_with_recruiter iframe_apply]
  before_action :is_subscribed?, only: %i[post_question post_job]

  layout 'static'


  add_breadcrumb 'Home', '/'
  add_breadcrumb 'Jobs', :static_jobs_path

  def index
    session[:previous_url] = request.url
    add_breadcrumb params[:category].titleize, static_jobs_path if params[:category].present?

    @current_company = current_company

    if request.subdomain == 'app'
      @candidates_hot = CandidatesCompany.hot_candidate.group_by(&:candidate_id).first(3).map{ |a| a[1].first}
      @jobs_hot = Job.active.is_public.where(listing_type: 'Job').order(created_at: :desc).first(3)
    elsif @current_company.present?
      @candidates_hot = current_company.candidates_companies.hot_candidate.group_by(&:candidate_id).first(3).map{ |a| a[1].first} unless current_company.nil?
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
    @uniq_candidates_company = CandidatesCompany.where(id: CandidatesCompany.hot_candidate.uniq(&:candidate_id) )

    if request.subdomain == 'app'
      if candidate_ids.present?
        @candidates = CandidatesCompany.hot_candidate.where(candidate_id: candidate_ids.uniq).paginate(page: params[:page], per_page: 50)
      else
        @candidates = @uniq_candidates_company.paginate(page: params[:page], per_page: 50)
      end
      @candidates_hot = CandidatesCompany.hot_candidate.group_by(&:candidate_id).sort.reverse.first(3).map{ |a| a[1].first}
      @jobs_hot = Job.active.is_public.where(listing_type: 'Job').order(created_at: :desc).first(3)
    elsif @current_company.present?
      @uniq_candidates_company = CandidatesCompany.where(id: CandidatesCompany.hot_candidate.uniq(&:candidate_id))
      @candidates_hot = @uniq_candidates_company.where(company_id: @current_company.id).first(3)
      @jobs_hot = @current_company.jobs.active.is_public.where(listing_type: 'Job').order(created_at: :desc).first(3)

      if candidate_ids.present?
        @uniq_candidates_company = current_company.candidates_companies.hot_candidate.where(candidate_id: candidate_ids).group_by(&:candidate_id).map{|a| a[1].first}
        @candidates = @uniq_candidates_company.paginate(page: params[:page], per_page: 50)
      else
        @uniq_candidates_company = CandidatesCompany.where(company_id: @current_company.id).hot_candidate.uniq(&:candidate_id)
        @candidates = @uniq_candidates_company.paginate(page: params[:page], per_page: 50)
      end
    end
    flash.now[:alert] = 'Please login with Company ID' if params[:is_chat_candidate].present? && params[:is_chat_candidate] == 'true'
    render layout: 'kulkakit'
  end

  def static_feeds
    @current_company = current_company
    if @current_company.present? || request.subdomain == 'app'
      if request.subdomain == 'app'
        @company_jobs = Job.all.active.not_system_generated.includes(:created_by)
        @candidates_hot = CandidatesCompany.hot_candidate.group_by(&:candidate_id).first(3).map{ |a| a[1].first}
      else
        @company_jobs = @current_company.jobs.active.not_system_generated.includes(:created_by)
        @candidates_hot = @current_company.candidates_companies.hot_candidate.group_by(&:candidate_id).first(3).map{ |a| a[1].first}
      end
      @jobs_hot = @company_jobs.where(listing_type: 'Job').order(created_at: :desc).first(3)
      @company_jobs = @company_jobs.search_with(params[:input_search]) if params[:input_search]

      if params.key?(:sort).present?
        if params[:sort] == 'created_asc'
          puts 'Sorting created_asc'
          @company_jobs = @company_jobs.order(created_at: :asc)
        elsif params[:sort] == 'created_desc'
          puts 'Sorting created_desc'
          @company_jobs = @company_jobs.order(created_at: :desc)
        elsif params[:sort] == 'trending_asc'
          puts 'Sorting trending_asc'
          @company_jobs = @company_jobs.left_joins(:job_applications).group(:id).order('COUNT(job_applications.id) ASC');
        elsif params[:sort] == 'trending_desc'
          puts 'Sorting trending_desc'
          @company_jobs = @company_jobs.left_joins(:job_applications).group(:id).order('COUNT(job_applications.id) DESC');
        else
          puts 'Sorting invalid input'
          @company_jobs = @company_jobs.order(created_at: :desc)
        end
      else
        puts 'Sorting not present'
        @company_jobs = @company_jobs.order(created_at: :desc)
      end

      if params.key?(:selected_categories).present?
          if params.key?(:input_search).present?
            if params[:selected_categories] == "all"
            @company_jobs = @company_jobs.where.not(listing_type: 'Job').where("lower(title) LIKE (?)","%#{params[:input_search].downcase}%").paginate(page: params[:page], per_page: 20)
            else
            @company_jobs = @company_jobs.where(listing_type: params[:selected_categories].to_s.split(',')).where("lower(title) LIKE (?)","%#{params[:input_search].downcase}%").paginate(page: params[:page], per_page: 20)
            end
          else
            if params[:selected_categories] == "all"
            @company_jobs = @company_jobs.where.not(listing_type: 'Job').paginate(page: params[:page], per_page: 20)
            else
            @company_jobs = @company_jobs.where(listing_type: params[:selected_categories].to_s.split(',')).paginate(page: params[:page], per_page: 20)
            end
          end
      else  
        @company_jobs = @company_jobs.where.not(listing_type: 'Job').paginate(page: params[:page], per_page: 20)
      end
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
      compny.name = from.domain.split('@')[0].split('.').first
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
      @candidates_hot = @current_company.hot_candidates.uniq(&:candidate_id).first(3)
      @jobs_hot = @current_company.jobs.active.is_public.where(listing_type: 'Job').order(created_at: :desc).first(3)
    end

    if @job.present?
      # handle_google_update(@job)

      add_breadcrumb @job.title, static_job_path
      @related = @current_company.jobs.active.is_public.where(listing_type: 'Blog').first(2)
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

  def post_question
    if current_user.present?
      @job            = current_company.jobs.new(company_job_params.merge!(created_by_id: current_user.id, listing_type: 'Question'))
      @job.start_date = Time.now
      @job.end_date   = @job.start_date + 1000.years
      @job.status     = Job::STATUSES[:published]

      flash[:errors]  = @job.errors.full_messages unless @job.save
      redirect_to root_path
    elsif current_candidate.present?
      @job            = current_company.jobs.new(company_job_params.merge!(created_by_candidate_id: current_candidate.id, listing_type: 'Question'))
      @job.start_date = Time.now
      @job.end_date   = @job.start_date + 1000.years
      @job.status     = Job::STATUSES[:published]

      flash[:errors] = @job.errors.full_messages unless @job.save
      redirect_to root_path
    else
      flash[:errors] = 'You must be logged in to post a question!'
      redirect_to root_path
    end
  end



  def post_job
    if current_user.present?
      @job = current_company.jobs.new(company_user_job_params.merge!(created_by_id: current_user.id, listing_type: 'Job', status: 'Draft'))
      if @job.save
        handle_google_update(@job)
        flash[:success] = 'The job was successfully created!'
        return  redirect_to @job
      else
        flash[:errors] = @job.errors.full_messages
      end

    elsif current_candidate.present?
      @job = current_company.jobs.new(company_candidate_job_params.merge!(created_by_candidate_id: current_candidate.id, listing_type: 'Job', status: 'Draft'))
      if @job.save
        handle_google_update(@job)
        flash[:success] = 'The job was successfully created! An admin will review it before it shows up in the feed.'
      else
        flash[:errors] = @job.errors.full_messages
      end
      if current_company.owner.present?
        current_company.owner.notifications.create(
          title: "A new job listing created by #{@job.created_by_candidate.full_name} needs to be reviewed!",
          message: "#{@job.created_by_candidate.full_name} has just created a new job listing! It needs to be reviewed before it can be published to the main feed. You can review it here: #{jobs_url(@job)}",
          notification_type: 'job',
          createable_id: @job.created_by_candidate_id,
          createable_type: 'Candidate'
        )
      elsif current_company.admins.first.present?
        current_company.owner.notifications.create(
          title: "A new job listing created by #{@job.created_by_candidate.full_name} needs to be reviewed!",
          message: "#{@job.created_by_candidate.full_name} has just created a new job listing! It needs to be reviewed before it can be published to the main feed. You can review it here: #{jobs_url(@job)}",
          notification_type: 'job',
          createable_id: @job.created_by_candidate_id,
          createable_type: 'Candidate'
        )

      end

      redirect_to root_path
    else
      flash[:errors] = 'You must be logged in to post a new job!'
      redirect_to root_path
    end
  end

  private

  def set_jobs
    @current_company = current_company
    ids = params[:ids]
    job_ids = ids.split(',').map(&:to_i) if ids.present?
    if request.subdomain == 'app'
      if job_ids.present?
        @search = params[:category].present? ? Job.includes(:created_by).active.is_public.where('job_category =?', params[:category], id: job_ids).ransack(params[:q]) : Job.includes(:created_by).active.is_public.where(id: job_ids).ransack(params[:q])
      else
        @search = params[:category].present? ? Job.includes(:created_by).active.is_public.where('job_category =?', params[:category]).ransack(params[:q]) : Job.includes(:created_by).active.is_public.ransack(params[:q])
      end
      jobs = @search.result(distinct: true).where(listing_type: 'Job').order(created_at: :desc).paginate(page: params[:page], per_page: 50)
      # @search_q = Job.is_public.active.ransack(params[:q])
      # @jobs_groups = @search_q.result.group_by(&:job_category)
      if jobs.present?
        @job_all = jobs
      elsif job_ids.present?
        @job_all = Job.includes(:created_by).active.is_public.where(listing_type: 'Job', id: job_ids).order(created_at: :desc).paginate(page: params[:page], per_page: 50) || []
      else
        @job_all = Job.includes(:created_by).active.is_public.where(listing_type: 'Job').order(created_at: :desc).paginate(page: params[:page], per_page: 50) || []
      end
      @job_categories = Job.active.is_public.pluck(:job_category).uniq
    elsif @current_company.present?
      if job_ids.present?
        @search = params[:category].present? ? @current_company.jobs.active.is_public.where('job_category =?', params[:category], id: job_ids).ransack(params[:q]) : @current_company.jobs.active.is_public.where(id: job_ids).ransack(params[:q])
      else
        @search = params[:category].present? ? @current_company.jobs.active.is_public.where('job_category =?', params[:category]).ransack(params[:q]) : @current_company.jobs.active.is_public.ransack(params[:q])
      end
      jobs = @search.result(distinct: true).where(listing_type: 'Job').order(created_at: :desc).paginate(page: params[:page], per_page: 50)
      if jobs.present?
        @job_all = jobs
      elsif job_ids.present?
        @job_all = @current_company.jobs.includes(:created_by).active.is_public.where(listing_type: 'Job', id: job_ids).order(created_at: :desc).paginate(page: params[:page], per_page: 50) || []
      else
        @job_all = @current_company.jobs.includes(:created_by).active.is_public.where(listing_type: 'Job').order(created_at: :desc).paginate(page: params[:page], per_page: 50) || []
      end
      @job_categories = @current_company.jobs.active.is_public.pluck(:job_category).uniq
    else
      @search = Job.includes(:created_by).active.is_public.where(listing_type: 'Job').ransack(params[:q])
      @job_all = []
      @job_categories = []
    end
  end

  def find_job
    @job = Job.is_public.where(id: params[:id] || params[:job_id]).first
  end

  def custom_domain?
    if Rails.env == "development"
      return false
    else
      request_domain_with_port = "#{request.domain}#{request.port_string}"
      request_domain_with_port != Rails.application.config.domain
    end
  end

  def current_company
    if custom_domain?
      Company.find_by(custom_domain: request.host)
    else
      Company.find_by(slug: request.subdomain)
    end
  end

  def company_job_params
    params
      .require(:job)
      .permit([:status,
               :source,
               :title,
               :files,
               :description,
               :location,
               :job_category,
               :is_public,
               :start_date,
               :end_date,
               :tag_list,
               :video_file,
               :industry,
               :department,
               :job_type,
               :price,
               :education_list,
               :comp_video,
               :listing_type,
               custom_fields_attributes: %i[id name value required _destroy],
               job_requirements_attributes: %i[id questions ans_type ans_mandatroy multiple_ans multiple_option]])
  end

  def company_user_job_params
    params
      .require(:job)
    .permit([:status,
               :source,
               :title,
               :files,
               :description,
               :location,
               :job_category,
               :is_public,
               :start_date,
               :end_date,
               :tag_list,
               :video_file,
               :industry,
               :department,
               :job_type,
               :price,
               :education_list,
               :comp_video,
               :listing_type,
               custom_fields_attributes: %i[id name value required _destroy],
               job_requirements_attributes: %i[id questions ans_type ans_mandatroy multiple_ans multiple_option]])
  end

  def company_candidate_job_params
    params
      .require(:job)
      .permit([:source,
               :title,
               :files,
               :description,
               :location,
               :job_category,
               :is_public,
               :start_date,
               :end_date,
               :tag_list,
               :video_file,
               :industry,
               :department,
               :job_type,
               :price,
               :education_list,
               :comp_video,
               custom_fields_attributes: %i[id name value required _destroy],
               job_requirements_attributes: %i[id questions ans_type ans_mandatroy multiple_ans multiple_option]])
  end

  def handle_google_update(job)
    url = static_job_url(job)
    update_google_job(url: url)
  end

  def handle_google_get(job)
    url = request.url + 'static/jobs/' + job.id.to_s
    get_google_job(url: url)
  end


end
