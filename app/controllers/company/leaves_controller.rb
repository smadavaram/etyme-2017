class Company::LeavesController <Company::BaseController

  before_action :find_consultant
  before_action :find_leave ,only: [:show,:edit,:update,:destroy,:accept_leave,:reject_leave]

  def index
    add_breadcrumb "Leaves", consultant_leaves_path(current_user)
    @consultant_leaves = @consultant.leaves || []
  end

  def show
    # add_breadcrumb @company_job.title. titleize, :job_invitations_path, options: { title: "Job Invitation" }
  end

  def new
    add_breadcrumb "Leaves", consultant_leaves_path(current_user)
    add_breadcrumb "NEW", new_consultant_leave_path(current_user,@consultant_leave), options: {  }
    @consultant_leave = @consultant.leaves.new
  end

  def edit
    add_breadcrumb "Leaves", consultant_leaves_path()
    add_breadcrumb "Edit", edit_consultant_leave_path(current_user,@consultant_leave)
  end

  def create
    @consultant_leave =  @consultant.leaves.new(leave_params)
    if  @consultant_leave.save
      flash[:success] = 'Leave was successfully created.'
      redirect_to  consultant_leaves_path(current_user)
    else
      flash[:errors] =  @consultant_leave.errors.full_messages
      redirect_to :back
    end
  end

  def employees_leaves
    @employee_leaves=current_company.leaves
  end

  # def destroy
  #
  # end

  def update
    if @consultant_leave.update(leave_params)
      flash[:success]="Leave Successfully Updated"
      redirect_to consultant_leaves_path(current_user)
    else
      flash[:errors]="Leave not updated"
      redirect_to :back
    end
  end

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
