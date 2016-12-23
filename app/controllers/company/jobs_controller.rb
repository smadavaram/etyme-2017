class Company::JobsController < Company::BaseController

  before_action :set_company_job, only: [:show, :edit, :update, :destroy , :send_invitation]
  before_action :set_locations  , only: [:new , :edit , :create,:show]
  before_action :set_preferred_vendors , only: [:send_invitation]
  before_action :set_candidates,only: :send_invitation

  add_breadcrumb "JOBS", :jobs_path, options: { title: "JOBS" }


  def index
    @company_jobs = current_company.jobs || []
  end

  def show
    add_breadcrumb @company_job.title. titleize, :job_path, options: { title: "Job Invitation" }
  end

  def new
    add_breadcrumb "NEW", :new_job_path, options: { title: "NEW JOB" }
    @company_job = current_company.jobs.new
  end

  def edit
    add_breadcrumb "EDIT", edit_job_path(@company_job), options: { title: "NEW EDIT" }
  end

  def create
    @company_job = current_company.jobs.new(company_job_params.merge!(created_by_id: current_user.id))

    respond_to do |format|
      if @company_job.save
        format.html { redirect_to @company_job, notice: 'Job was successfully created.' }
        format.json { render :show, status: :created, location: @company_job }
      else
        format.html { redirect_to :back , errors:  @company_job.errors.full_message}
        format.json { render json: @company_job.errors, status: :unprocessable_entity }
      end
    end
  end

  def update
    respond_to do |format|
      if @company_job.update(company_job_params)
        format.html { redirect_to @company_job, notice: 'Job was successfully updated.' }
        format.json { render :show, status: :ok, location: @company_job }
      else
        format.html { render :edit }
        format.json { render json: @company_job.errors, status: :unprocessable_entity }
      end
    end
  end
  
  def destroy
    # @company_job.destroy
    # respond_to do |format|
    #   format.html { redirect_to jobs_url, notice: 'Job was successfully destroyed.' }
    #   format.json { head :no_content }
    # end
  end

  def send_invitation
    respond_to do |format|
      format.js
    end
  end

  private
    def set_candidates
      @candidates=Candidate.all
    end
    def set_company_job
      @company_job = current_company.jobs.find_by_id(params[:id]) || []
    end

    def set_locations
      @locations = current_company.locations || []
    end

    def set_preferred_vendors
      # @preferred_vendors_companies = Company.joins(:users).where("users.type = ?" , 'Vendor') - [current_company]|| []
      @preferred_vendors_companies = Company.vendors - [current_company] || []
    end

    def company_job_params
      params.require(:job).permit([:title,:description,:location_id, :is_public , :start_date , :end_date , :tag_list ,custom_fields_attributes:
          [
              :id,
              :name,
              :value,
              :_destroy
          ]])
    end
end
