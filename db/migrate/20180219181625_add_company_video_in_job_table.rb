class AddCompanyVideoInJobTable < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :jobs, :comp_video, :string
  end
end
