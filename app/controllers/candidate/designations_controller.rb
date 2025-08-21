# frozen_string_literal: true

class Candidate::DesignationsController < Candidate::BaseController
  skip_before_action :authenticate_candidate!, only: :accept
  before_action :set_designation, only: :accept

  def accept
    if @designation.verified!
      flash[:success] = 'Invitation Is Accepted'
    else
      flash[:error] = 'Something went wrong'
    end
    redirect_back(fallback_location: root_path)
  end

  def set_designation
    @designation = Designation.find_by(id: params[:id])
  end
end
