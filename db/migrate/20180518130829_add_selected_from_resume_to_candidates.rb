class AddSelectedFromResumeToCandidates < ActiveRecord::Migration[5.1]
  def change
    add_column :candidates, :selected_from_resume, :string
  end
end
