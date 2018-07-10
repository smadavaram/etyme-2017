class Company::JobsController < Company::BaseController

  before_action :set_company_job, only: [:show, :edit, :update, :destroy , :send_invitation]
  # before_action :set_locations  , only: [:new , :index, :edit , :create,:show]
  before_action :set_preferred_vendors , only: [:send_invitation]
  before_action :set_candidates,only: :send_invitation
  before_action :authorize_user, only: [:show, :edit, :update, :destroy ]

  add_breadcrumb "JOBS", :jobs_path, options: { title: "JOBS" }


  def index
    @search =  current_company.jobs.not_system_generated.includes(:created_by).order(created_at: :desc).search(params[:q])
    @company_jobs = @search.result.order(created_at: :desc)#.paginate(page: params[:page], per_page: params[:per_page]||=15) || []
    @job = current_company.jobs.new
  end
  def show
    add_breadcrumb @job.try(:title).try(:titleize)[0..30], :job_path, options: { title: "Job Invitation" }
    @job_applications = @job.job_applications
    @conversations = @job.conversations
  end

  def new
    add_breadcrumb "NEW", :new_job_path, options: { title: "NEW JOB" }
    @job = current_company.jobs.new
    @job.job_requirements.build
  end

  def edit
    add_breadcrumb "EDIT", edit_job_path(@job), options: { title: "NEW EDIT" }
  end

  def create
    params[:job][:start_date] = Time.strptime(params[:job][:start_date], "%m/%d/%Y") if params[:job][:start_date].present?
    params[:job][:end_date] = params[:job][:end_date].present? ? Time.strptime(params[:job][:end_date], "%m/%d/%Y") : Time.parse("31/12/9999")
    @job = current_company.jobs.new(company_job_params.merge!(created_by_id: current_user.id))

    respond_to do |format|
      if @job.save
        format.html { redirect_to @job, success: 'Job was successfully created.' }
        format.js{ flash.now[:success] = "successfully Created." }
      else
        format.html { flash[:errors] = @job.errors.full_messages; render :new}
        format.js{ flash.now[:errors] =  @job.errors.full_messages }
      end
    end
  end

  def update
    respond_to do |format|
      if @job.update(company_job_params)
        format.html { redirect_to @job, notice: 'Job was successfully updated.' }
        format.json { render :show, status: :ok, location: @job }
      else
        format.html { render :edit }
        format.json { render json: @job.errors, status: :unprocessable_entity }
      end
    end
  end
  
  def destroy
    @job.destroy
    respond_to do |format|
      format.html { redirect_to jobs_url, notice: 'Job was successfully destroyed.' }
      format.json { head :no_content }
    end
  end

  def send_invitation
    respond_to do |format|
      format.js
    end
  end

  def authorize_user
    has_access?("manage_jobs")
  end

  def share_jobs
    j_ids = params[:jobs_ids].split(",").map { |s| s.to_i }
    jobs = Job.where("id IN (?) AND end_date >= ? ",j_ids, Date.today)

    if jobs.present?
      emails = []
      params[:emails].each do |e|
        email = e.include?('[') ? JSON.parse(e) : e
        emails << email
      end
      params[:emails_bcc].each do |e|
        email = e.include?('[') ? JSON.parse(e) : e
        emails << email
      end

      Job.share_jobs(current_user.email, emails.flatten.uniq.split(","), j_ids, current_company, params[:message], params[:subject])
      flash[:success] = "job shared successfully."
    else
      flash[:errors] = "There is no one active job."
    end

    redirect_back fallback_location: root_path
  end

  private
    def set_candidates
      @candidates = Candidate.all
    end
    def set_company_job
      @job = current_company.jobs.find_by_id(params[:id]) || []
    end

    # def set_locations
    #   @locations = current_company.locations || []
    # end

    def set_preferred_vendors
      # @preferred_vendors_companies = Company.joins(:users).where("users.type = ?" , 'Vendor') - [current_company]|| []
      @preferred_vendors_companies = Company.vendors - [current_company] || []
    end


    def company_job_params
      params.require(:job).permit([:title,:description,:location,:job_category, :is_public , :start_date , :end_date , :tag_list, :video_file, :industry, :department, :job_type, :price, :education_list, :comp_video, :listing_type, custom_fields_attributes:
          [
              :id,
              :name,
              :value,
              :required,
              :_destroy
          ],job_requirements_attributes:[
                                       :id,
                                       :questions,
                                       :ans_type,
                                       :ans_mandatroy,
                                       :multiple_ans,
                                       :multiple_option
                                         ]])
    end
end
