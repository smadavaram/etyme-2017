class CandidatesCompaniesController < ApplicationController
  def new
    @candidates_company = CandidatesCompany.new
    render 'company/candidates/invite'
  end

  def create
    if current_company.candidates_companies.exists?(candidate_id: params[:id])
      flash[:notice] = 'Candidate already exists in the company.'
    else
      current_company.candidates_companies.create(candidate_id: params[:id])
      flash[:success] = 'The candidate has been added successfully!'
    end

    redirect_to job_applications_path
  end
end
