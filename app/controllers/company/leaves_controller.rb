# frozen_string_literal: true

class Company::LeavesController < Company::BaseController
  before_action :find_consultant
  before_action :find_leave, only: %i[show edit update destroy accept reject]
  before_action :authorized_user, only: %i[accept reject show]

  def index
    add_breadcrumb 'Leaves', consultant_leaves_path(current_user)
    @consultant_leaves = @consultant.leaves || []
  end

  def show
    # add_breadcrumb @company_job.title. titleize, :job_invitations_path, options: { title: "Job Invitation" }
  end

  # def new
  #   add_breadcrumb "Leaves", consultant_leaves_path(current_user)
  #   add_breadcrumb "NEW", new_consultant_leave_path(current_user,@consultant_leave), options: {  }
  #   @consultant_leave = @consultant.leaves.new
  # end

  # def edit
  #   add_breadcrumb "Leaves", consultant_leaves_path()
  #   add_breadcrumb "Edit", edit_consultant_leave_path(current_user,@consultant_leave)
  # end

  def create
    @consultant_leave =  @consultant.leaves.new(leave_params)
    if @consultant_leave.save
      flash[:success] = 'Successfully Applied for Leave.'
      redirect_to consultant_leaves_path(current_user)
    else
      flash[:errors] = @consultant_leave.errors.full_messages
      redirect_back fallback_location: root_path
    end
  end

  def employees_leaves
    add_breadcrumb current_company.try(:name).try(:humanize), dashboard_path
    add_breadcrumb 'Emplyees Leaves'.humanize, employees_leaves_path
    @employee_leaves = current_company.leaves
  end

  # def destroy
  #
  # end

  def update
    if @consultant_leave.update(leave_params)
      flash[:success] = 'Leave Successfully Updated'
      redirect_to consultant_leaves_path(current_user)
    else
      flash[:errors] = 'Leave not updated'
      redirect_back fallback_location: root_path
    end
  end

  def accept
    respond_to do |format|
      if @consultant_leave.pending?
        if @consultant_leave.accepted!
          format.js { flash[:success] = 'Successfully Accepted.' }
        else
          format.js { flash[:errors] =  @consultant_leave.errors.full_messages }
        end
      else
        format.js { flash[:errors] = ['Request Not Completed.'] }
      end
    end
  end

  def reject
    respond_to do |format|
      if @consultant_leave.pending?
        if @consultant_leave.rejected!
          format.js { flash[:success] = 'Successfully Rejected.' }
        else
          format.js { flash[:errors] =  @consultant_leave.errors.full_messages }
        end
      else
        format.js { flash[:errors] = ['Request Not Completed.'] }
      end
    end
  end

  def authorized_user
    has_access?('manage_leaves')
  end

  private

  def find_consultant
    @consultant = current_company.consultants.find_by_id(params[:consultant_id])
  end

  def find_leave
    @consultant_leave = @consultant.leaves.find_by_id(params[:id])
  end

  def leave_params
    params.require(:leave).permit(:from_date, :till_date, :reason, :response_message, :status, :leave_type)
  end
end
