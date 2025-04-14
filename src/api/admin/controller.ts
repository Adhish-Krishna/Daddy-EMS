import { Request,Response } from "express";
import prisma from '../../prisma.js';
import {
    Attendance,
    CreateEventDTO,
    PastEventData,
    PastEventsResponse,
    PrismaEvent,
    ClubMembers
} from "./types.js";


const putAttendance = async (req:Request,res:Response) : Promise<void>=>{
    try{
        const attendance : Attendance = req.body;
        if (!attendance.event_id || !attendance.user_id || attendance.is_present === undefined) {
            res.status(400).json({
                message: "Required fields missing: event_id, user_id, and is_present are required"
            });
            return;
        }
        const updatedAttendance = await prisma.teammembers.updateMany({
            where:{
                event_id: attendance.event_id,
                user_id: attendance.user_id
            },
            data:{
                is_present: attendance.is_present
            }
        })

        if (updatedAttendance.count==0){
            res.status(404).json({
                message : "No record found for matching event_id and user_id"
            });
            return;
        }
        res.status(200).json({
            message: "Attendance updated successfully for the given user_id and event_id"
        })
    }catch(error){
        res.status(500).json({
            message : "Internal server error while updating attendance",
            error : error
        });
    }
}

const createEventController = async (req: Request, res: Response): Promise<void> => {
    try {
        const EventDetails: CreateEventDTO = req.body;

        
        if (
            !EventDetails.name ||
            !EventDetails.date ||
            !EventDetails.event_type ||
            !EventDetails.event_category ||
            !EventDetails.min_no_member ||
            !EventDetails.max_no_member ||
            !EventDetails.club_id ||
            !EventDetails.venue ||
            !EventDetails.about
        ) {
            res.status(400).json({ message: "Missing required fields." });
            return;
        }

        
        const existingEvent = await prisma.events.findFirst({
            where: {
                name: EventDetails.name,
                date: new Date(EventDetails.date),
                venue: EventDetails.venue,
            },
        });

        if (existingEvent) {
            res.status(409).json({ message: "Event already exists with the same name, date, and venue." });
            return;
        }

        
        if (EventDetails.eventConvenors && EventDetails.eventConvenors.length > 0) {
            const convenorRollnos = EventDetails.eventConvenors.slice(0, 3);
            
            const convenorUsers = await prisma.users.findMany({
                where: {
                    rollno: {
                        in: convenorRollnos.map(rollno => rollno.toLowerCase())
                    }
                },
                select: {
                    id: true,
                    rollno: true
                }
            });

            const nonExistentRollnos = convenorRollnos.filter(
                rollno => !convenorUsers.some(user => user.rollno?.toLowerCase() === rollno.toLowerCase())
            );
            
            if (nonExistentRollnos.length > 0) {
                const message = `Event creation failed. The following users could not be added as convenors because they don't exist in the database: ${nonExistentRollnos.join(', ')}`;
                res.status(400).json({ message });
                return;
            }
        }
       
        // Create the event only after validation
        const event = await prisma.events.create({
            data: {
                name: EventDetails.name,
                about: EventDetails.about,
                date: new Date(EventDetails.date),
                event_type: EventDetails.event_type,
                venue: EventDetails.venue,
                event_category: EventDetails.event_category,
                min_no_member: EventDetails.min_no_member,
                max_no_member: EventDetails.max_no_member,
                poster: EventDetails.poster || null,
                chief_guest: EventDetails.chief_guest || null,
                exp_expense: EventDetails.exp_expense || null,
                tot_amt_allot_su: EventDetails.tot_amt_allot_su || null,
                tot_amt_spt_dor: EventDetails.tot_amt_spt_dor || null,
                exp_no_aud: EventDetails.exp_no_aud || null,
                faculty_obs_desig: EventDetails.faculty_obs_desig || null,
                faculty_obs_dept: EventDetails.faculty_obs_dept || null
            },
        });

        await prisma.organizingclubs.create({
            data: {
                club_id: EventDetails.club_id,
                event_id: event.id,
            },
        });

      
        if (EventDetails.eventConvenors && EventDetails.eventConvenors.length > 0) {
            const convenorRollnos = EventDetails.eventConvenors.slice(0, 3);
            
            const convenorUsers = await prisma.users.findMany({
                where: {
                    rollno: {
                        in: convenorRollnos.map(rollno => rollno.toLowerCase())
                    }
                },
                select: {
                    id: true,
                    rollno: true
                }
            });
           
            const nonMembers: string[] = [];
            const validConvenors: {id: number}[] = [];

           
            for (const user of convenorUsers) {
                const isMember = await prisma.clubmembers.findFirst({
                    where: {
                        user_id: user.id,
                        club_id: EventDetails.club_id
                    }
                });
                
                if (isMember) {
                    validConvenors.push({ id: user.id });
                } else {
                    nonMembers.push(user.rollno!);
                }
            }

           
            if (validConvenors.length > 0) {
                for (const user of validConvenors) {
                    await prisma.eventconvenors.create({
                        data: {
                            user_id: user.id,
                            event_id: event.id,
                            club_id: EventDetails.club_id
                        }
                    });
                }
            }

            
            if (nonMembers.length > 0) {
                const message = `Event created successfully, but the following users could not be added as convenors because they are not members of the club: ${nonMembers.join(', ')}`;
                res.status(201).json({ message });
                return;
            }
        }

        res.status(201).json({
            message: "Event created successfully.",
        });

    } catch (err: any) {
        console.error("Event creation error:", err);
        res.status(500).json({
            message: "Something went wrong.",
        });
    }
};

const getPastEventsByClubController = async (req: Request, res: Response): Promise<void> => {
    try {
      const { club_id } = req.query;
      console.log("club_id from query:", req.query.club_id);

      if (!club_id) {
        res.status(400).json({ message: "Club ID is required." });
        return;
      }

      const today = new Date();

      const pastEvents = await prisma.events.findMany({
        where: {
          date: {
            lt: today,
          },
          organizingclubs: {
            some: {
              club_id: Number(club_id),
            },
          },
        },
        include: {
          eventconvenors: {
            include: {
              users: {
                select: {
                  name: true,
                  department: true,
                  yearofstudy: true,
                },
              },
            },
          },
          eventwinners: {
            include: {
              teams: {
                select: {
                  name: true,
                },
              },
            },
          },
          feedback: true,
          eventregistration: true,
          teammembers: true,
        },
      }) as PrismaEvent[];

      const formattedData: PastEventData[] = pastEvents.map(event => {
        const average_rating = event.feedback.length
          ? event.feedback.reduce((acc: number, f) => acc + (f.rating || 0), 0) / event.feedback.length
          : 0;


        const eventConvenors = event.eventconvenors.map((ec) => ({
          name: ec.users?.name || null,
          department: ec.users?.department || null,
          yearofstudy: ec.users?.yearofstudy || null,
        }));


        const eventWinners = event.eventwinners.map((w) => ({
          position: w.position,
          team_name: w.teams?.name || null,
        }));


        const total_attendance = event.teammembers.filter(member => member.is_present).length;

        return {
          name: event.name,
          about: event.about,
          date: event.date,
          event_type: event.event_type,
          event_category: event.event_category,
          eventConvenors,
          eventWinners,
          average_rating: Number(average_rating.toFixed(2)),
          total_registered_teams: event.eventregistration.length,
          total_attendance,
        };
      });

      const response: PastEventsResponse = {
        message: "Past events details retrieved successfully.",
        data: formattedData,
      };

      res.status(200).json(response);

    } catch (error) {
      console.error("Error fetching past events:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };

const fetchProfile = async (req: Request, res: Response): Promise<void> =>{
    try{
        const admin_id = req.admin_user_id;
        const club_id = req.admin_club_id;
        const adminDetails = await prisma.users.findFirst({
            where:{
                id: admin_id
            },
            select: {
                name: true,
                rollno: true,
            }
        });
        const clubDetails = await prisma.clubs.findFirst({
            where:{
                id: club_id
            },
            select:{
                id: true,
                name: true,
            }
        });
        if(!adminDetails || !clubDetails){
            res.status(301).json({
                message: "Admin or Club data not found"
            });
            return;
        }
        const responseData = {
            name: adminDetails.name,
            rollno: adminDetails.rollno,
            club: clubDetails.name,
        }
        res.status(200).json({
            message: "Admin profile fetched successfully",
            data: responseData
        });
        return;
    }catch(err){
        res.status(500).json({
            message: err
        });
    }
}

const addCubmembers = async (req: Request, res: Response): Promise<void> => {
    try {
        const club_id = req.admin_club_id; 
        const { members } = req.body as ClubMembers;

        if (!members || !Array.isArray(members) || members.length === 0) {
            res.status(400).json({
                message: "Members array is required and cannot be empty"
            });
            return;
        }

        let successCount = 0;
        const errorDetails = [] as Array<{rollno: string, status: string, message: string}>;
        
        for (const member of members) {
            if (!member.rollno) {
                errorDetails.push({
                    rollno: member.rollno || "undefined",
                    status: "failed",
                    message: "Roll number is required"
                });
                continue;
            }

            try {
                // Check if user exists
                const user = await prisma.users.findUnique({
                    where: {
                        rollno: member.rollno.toLowerCase()
                    }
                });

                if (!user) {
                    errorDetails.push({
                        rollno: member.rollno,
                        status: "failed",
                        message: "User not found"
                    });
                    continue;
                }

                // Check if user is already a member of this club
                const existingClubMember = await prisma.clubmembers.findFirst({
                    where: {
                        user_id: user.id,
                        club_id: club_id
                    }
                });

                if (existingClubMember) {
                    errorDetails.push({
                        rollno: member.rollno,
                        status: "skipped",
                        message: "User is already a member of this club"
                    });
                    continue;
                }

                // Add the user to the club
                await prisma.clubmembers.create({
                    data: {
                        user_id: user.id,
                        club_id: club_id,
                        role: member.role || "Member",
                        is_admin: false // Regular member, not an admin
                    }
                });

                successCount++;
            } catch (err) {
                errorDetails.push({
                    rollno: member.rollno,
                    status: "failed",
                    message: "Error processing this member"
                });
                console.error(`Error adding club member ${member.rollno}:`, err);
            }
        }

        // If there were only successful additions
        if (successCount > 0 && errorDetails.length === 0) {
            res.status(200).json({
                message: "Members added successfully"
            });
            return;
        }
        
        // If there were errors but also some successes
        if (successCount > 0 && errorDetails.length > 0) {
            res.status(200).json({
                message: `${successCount} members added successfully, but some issues were encountered`,
                errors: errorDetails
            });
            return;
        }
        
        // If there were only errors
        if (successCount === 0 && errorDetails.length > 0) {
            res.status(400).json({
                message: "Failed to add members",
                errors: errorDetails
            });
            return;
        }

        res.status(200).json({
            message: "No action taken"
        });
        return;
    } catch (err) {
        console.error("Error adding club members:", err);
        res.status(500).json({
            message: "Failed to add club members"
        });
        return;
    }
};

export  {
    putAttendance,
    createEventController,
    getPastEventsByClubController,
    fetchProfile,
    addCubmembers
};