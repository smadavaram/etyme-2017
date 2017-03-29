class Company::StatusesController < Company::BaseController

  def create
    @status = current_user.statuses.new(status_params)
    if @status.save
      flash[:success] =  "Status created successfully."
      else
      flash[:errors] = @status.errors.full_messages
    end
    redirect_to :back
  end

  private
   def status_params
     params.require(:status).permit(:status_type,:note,:statusable_type,:statusable_id,:user_id)
   end
end
