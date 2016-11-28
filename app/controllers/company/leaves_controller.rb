class Company::LeavesController < InheritedResources::Base

  private

    def leafe_params
      params.require(:leafe).permit(:from_date, :till_date, :reason, :response_message, :status, :leave_type)
    end
end

