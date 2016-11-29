class Company::LeavesController <Company::BaseController

  #Callbacks
  before_action :find_consultant
  before_action :find_leave ,only: [:show,:edit,:update,:destroy]
  # add_breadcrumb "Leaves", consultant_leaves_path, options: {}

  # GET /consultant/leaves
  # GET /consultant/leaves.json
  def index
    add_breadcrumb "Leaves", consultant_leaves_path(current_user), options: {}
    @consultant_leaves = @consultant.leaves || []
  end

  # GET /company/jobs/1
  # GET /company/jobs/1.json
  def show
    # add_breadcrumb @company_job.title. titleize, :job_invitations_path, options: { title: "Job Invitation" }
  end

  # GET /company/jobs/new
  def new
    add_breadcrumb "NEW", new_consultant_leafe_path(current_user,@consultant_leave), options: {  }
    @consultant_leave = @consultant.leaves.new
  end

  # GET /company/jobs/1/edit
  def edit
    # add_breadcrumb "EDIT", edit_job_path(@company_job), options: { title: "NEW EDIT" }
  end

  # POST /company/jobs
  # POST /company/jobs.json
  def create
    @consultant_leave =  @consultant.leaves.new(leave_params)

    respond_to do |format|
      if  @consultant_leave.save
        format.html { redirect_to  consultant_leafe_path(@consultant,@consultant_leave), notice: 'Leave was successfully created.' }
        format.json { render :show, status: :created, location:  @consultant_leave }
      else
        format.html { redirect_to :back , errors:  @consultant_leave.errors.full_messages}
        format.json { render json:  @consultant_leave.errors, status: :unprocessable_entity }
      end
    end
  end

  # def destroy
  #
  # end

  # PATCH/PUT /company/jobs/1
  # PATCH/PUT /company/jobs/1.json
  def update
    respond_to do |format|
      if @consultant_leave.update(leave_params)
        format.html { redirect_to @consultant_leave, notice: 'Job was successfully updated.' }
        format.json { render :show, status: :ok, location: @consultant_leave }
      else
        format.html { render :edit }
        format.json { render json: @consultant_leave.errors, status: :unprocessable_entity }
      end
    end
  end

  def accept_leave
    if(@consultant_leave.status.is_pending?)
      if @consultant_leave.accepted!
        format.js{ flash[:success] = "successfully Accepted." }
      else
        format.js{ flash[:errors] =  @consultant_leave.errors.full_messages }
      end
    else
      format.js{ flash[:errors] =  ["Request Not Completed."]}
    end

  end
  def reject_leave
    if(@consultant_leave.status.is_pending?)
      if @consultant_leave.rejected!
        format.js{ flash[:success] = "successfully Accepted." }
      else
        format.js{ flash[:errors] =  @consultant_leave.errors.full_messages }
      end
    else
      format.js{ flash[:errors] =  ["Request Not Completed."]}
    end

  end



  private
    def find_consultant
      @consultant= current_company.consultants.find_by_id(params[:consultant_id])
    end
    def find_leave
      @consultant_leave=@consultant.leaves.find(params[:id])

    end

    def leave_params
      params.require(:leave).permit(:from_date, :till_date, :reason, :response_message, :status, :leave_type)
    end
end

