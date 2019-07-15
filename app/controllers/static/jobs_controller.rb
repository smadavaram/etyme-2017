class Static::JobsController < ApplicationController

  before_action :set_jobs, only: [:index]
  before_action :find_job, only: [:show, :apply, :job_appication_without_registeration, :job_appication_with_recruiter,:iframe_apply]

  layout 'static'
  add_breadcrumb "Home", '/'
  add_breadcrumb "Jobs", :static_jobs_path

  def index
    session[:previous_url] = request.url
    params[:category].present? ? (add_breadcrumb params[:category].titleize, :static_jobs_path) : ""
  end

  def get_attr_value(data_array, look)
    found_attr_value = nil
    data_array.each_with_index do |data, index|
      if data.match(/#{look}\s*:/i)
        found_attr_value = look == "description" ?
                               data.gsub(/#{look}\s*:/i, '') + data_array.slice(index, data_array.length).join("\n") :
                               data.gsub(/#{look}\s*:/i, '').strip
        break
      end
    end
    found_attr_value
  end

  def iframe_apply
    @job_application = @job.job_applications.new
    response.headers.delete "X-Frame-Options"
  end

  def job_attr_obj
    {
        status: "Draft",
        title: request.POST[:subject],
        source: nil,
        description: nil,
        location: nil,
        start_date: DateTime.now,
        end_date: nil,
        tag_list: nil,
        education_list: nil,
        price: nil,
        job_category: "Desktop Software Development,Ecommerce Development",
        industry: "Construction & Labour",
        department: "Logistics/Supply chain",
        job_type: "Full Time",
        listing_type: "Job"
    }
  end

  def job_attr_extractor
    job_attributes = job_attr_obj
    data_array = request.POST["stripped-text"].split(/\n/)
    job_attributes[:source] = get_attr_value(data_array, "source")
    job_attributes[:location] = get_attr_value(data_array, "location")
    job_attributes[:price] = get_attr_value(data_array, "pay").to_f
    job_attributes[:education_list] = get_attr_value(data_array, "education")
    job_attributes[:tag_list] = get_attr_value(data_array, "skills")
    job_attributes[:description] = get_attr_value(data_array, "description")
    job_attributes
  end

  def job_request
    subject = request.POST[:subject]
    from = Mail::Address.new(request.POST[:from])
    company_email = from.address.to_s
    company_domain = from.domain.split("@")[0]
    company = Company.find_by(domain: company_domain.split('.').first)
    full_name = from.name.split
    user = User.find_by_email(company_email) || User.create(:email => company_email, :first_name => full_name.first, :last_name => full_name.slice(1, full_name.length), :company_id => company.id)
    if company
      job = company.jobs.build(job_attr_extractor.merge({created_by_id: user.id}))
      job.title = "Draft Job" unless job.title.present?
      job.description = request.POST["stripped-html"] unless job.source and job.price and job.education_list and job.tag_list
      if job.save(:validate => false)
        begin
          JobMailer.send_confirmation_receipt(job).deliver_now
        rescue
        end
        render json: {message: 'Job Created'}, status: :ok
      else
        render json: {errors: job.errors.full_messages}, status: :unprocessable_entity
      end
    end
  end

  def show
    unless @job.present?
      flash[:error] = "Job not found."
      redirect_to static_jobs_path
    else
      add_breadcrumb @job.title, static_job_path
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

    p "3333333333333333333333333333333333"
    p "3333333333333333333333333333333333"
    p "3333333333333333333333333333333333"

  end


  private

  def set_jobs
    @search = params[:category].present? ? Job.active.is_public.where('job_category =?', params[:category]).search(params[:q]) : Job.active.is_public.search(params[:q])
    @jobs = @search.result(distinct: true).paginate(:page => params[:page], :per_page => 4)
    @search_q = Job.is_public.active.search(params[:q])
    @jobs_groups = @search_q.result.group_by(&:job_category)
  end

  def find_job
    @job = Job.active.is_public.where(id: params[:id] || params[:job_id]).first
  end

end
