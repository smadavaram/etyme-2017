# frozen_string_literal: true

class Candidate::EducationsController < Candidate::BaseController
  before_action :find_education, only: [:update]
  respond_to :json, :js
  def create
    @education = current_candidate.educations.new(education_params)
    if @education.save
      flash[:success] = 'Education successfully created.'
    else
      flash[:errors] = @education.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def update
    if @education.update_attributes(education_params)
      flash[:success] = 'Education Changed.'
    else
      flash[:errors] = @education.errors.full_messages
    end
    respond_with @education
  end

  private

  def find_education
    @education = current_candidate.educations.find(params[:id])
  end

  def education_params
    params.require(:education).permit(:id, :degree_title, :grade, :completion_year, :start_year, :institute, :description)
  end
end
