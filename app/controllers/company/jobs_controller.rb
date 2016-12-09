class Company::JobsController < Company::BaseController

  before_action :set_company_job, only: [:show, :edit, :update, :destroy , :send_invitation]
  before_action :set_locations  , only: [:new , :edit , :create,:show]
  before_action :set_preferred_vendors , only: [:send_invitation]

  add_breadcrumb "JOBS", :jobs_path, options: { title: "JOBS" }

  # GET /company/jobs
  # GET /company/jobs.json
  def index
    @company_jobs = current_company.jobs || []
  end

  # GET /company/jobs/1
  # GET /company/jobs/1.json
  def show
    add_breadcrumb @company_job.title. titleize, :job_invitations_path, options: { title: "Job Invitation" }
  end

  # GET /company/jobs/new
  def new
    add_breadcrumb "NEW", :new_job_path, options: { title: "NEW JOB" }
    @company_job = current_company.jobs.new
  end

  # GET /company/jobs/1/edit
  def edit
    add_breadcrumb "EDIT", edit_job_path(@company_job), options: { title: "NEW EDIT" }
  end

  # POST /company/jobs
  # POST /company/jobs.json
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

  # PATCH/PUT /company/jobs/1
  # PATCH/PUT /company/jobs/1.json
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

  # DELETE /company/jobs/1
  # DELETE /company/jobs/1.json
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
    # Use callbacks to share common setup or constraints between actions.
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

    # Never trust parameters from the scary internet, only allow the white list through.
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
