class AddCompanyVideoInJobTable < ActiveRecord::Migration[5.1]
  def change
    add_column :jobs, :comp_video, :string
  end
end
