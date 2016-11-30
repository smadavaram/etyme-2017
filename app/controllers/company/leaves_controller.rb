class Company::LeavesController <Company::BaseController

  #Callbacks
  before_action :find_consultant
  before_action :find_leave ,only: [:show,:edit,:update,:destroy,:accept_leave,:reject_leave]


  # GET /consultant/leaves
  # GET /consultant/leaves.json
  def index
    add_breadcrumb "Leaves", consultant_leaves_path(current_user)
    @consultant_leaves = @consultant.leaves || []
  end

  # GET /company/jobs/1
  # GET /company/jobs/1.json
  def show
    # add_breadcrumb @company_job.title. titleize, :job_invitations_path, options: { title: "Job Invitation" }
  end

  # GET /company/jobs/new
  def new
    add_breadcrumb "Leaves", consultant_leaves_path(current_user)
    add_breadcrumb "NEW", new_consultant_leafe_path(current_user,@consultant_leave), options: {  }
    @consultant_leave = @consultant.leaves.new
  end

  # GET /company/jobs/1/edit
  def edit
      add_breadcrumb "Leaves", consultant_leaves_path()
     add_breadcrumb "Edit", edit_consultant_leafe_path(current_user,@consultant_leave)
  end

  # POST /company/jobs
  # POST /company/jobs.json
  def create
    @consultant_leave =  @consultant.leaves.new(leave_params)
      if  @consultant_leave.save
        flash[:success] = 'Leave was successfully created.'
         redirect_to  consultant_leafe_path(@consultant,@consultant_leave)
      else
        flash[:errors] =  @consultant_leave.errors.full_messages
       redirect_to :back
      end
  end

  # def destroy
  #
  # end

  # PATCH/PUT /company/jobs/1
  # PATCH/PUT /company/jobs/1.json
  def update

    if @consultant_leave.update(leave_params)
      flash[:success]="Leave Successfully Updated"
      redirect_to consultant_leaves_path(current_user)
    else
      flash[:errors]="Leave not updated"
      redirect_to :back
    end

  end


  # accept leave
  def accept_leave
    respond_to do |format|
      if @consultant_leave.is_pending?
        if @consultant_leave.accepted!
          format.js{ flash[:success] = "successfully Accepted." }
        else
          format.js{ flash[:errors] =  @consultant_leave.errors.full_messages }
        end
      else
        format.js{ flash[:errors] =  ["Request Not Completed."]}
      end
    end
  end

  # reject leave
  def reject_leave
    respond_to do |format|
    if(@consultant_leave.is_pending?)
      if @consultant_leave.rejected!
        format.js{ flash[:success] = "successfully Accepted." }
      else
        format.js{ flash[:errors] =  @consultant_leave.errors.full_messages }
      end
    else
      format.js{ flash[:errors] =  ["Request Not Completed."]}
    end
    end
  end




  private
    def find_consultant
      @consultant= current_company.consultants.find_by_id(params[:consultant_id])
    end

    def find_leave
      @consultant_leave = @consultant.leaves.find_by_id(params[:id])
    end

    def leave_params
      params.require(:leave).permit(:from_date, :till_date, :reason, :response_message, :status, :leave_type)
    end
end

