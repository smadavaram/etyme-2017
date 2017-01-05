class Candidate::ExperiecesController < Candidate::BaseController


  private
  def experience_params
    params.require(:experience).permit(:id,:experience_title,:end_date,:start_date,:institute,:description)
  end
end
