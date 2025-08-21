class AddCandidateStatusInCandidateModel < ActiveRecord::Migration[4.2]
  def change
    change_column :candidates ,:status ,:integer ,default: 0
    # Candidate.where(status: nil).each do |user|
    #   if user.invited_by_id.present?
    #       user.status = 1
    #       user.save!
    #   else
    #     user.status = 0
    #     user.save!
    #   end
    # end
  end
end

